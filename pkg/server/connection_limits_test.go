package server

import (
	"io"
	"net"
	"net/http"
	"runtime"
	"strings"
	"testing"
	"time"
)

const (
	shortConnectionLimit = 100 * time.Millisecond
	connectionWaitLimit  = 5 * time.Second
)

func startLimitedServer(t *testing.T) *Server {
	t.Helper()
	s := newBareServer(t)
	s.readHeaderTimeout = shortConnectionLimit
	s.idleTimeout = shortConnectionLimit
	if err := s.Start("127.0.0.1", "0", nil); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Stop() })
	return s
}

// waitForClose reports whether the server closes conn before connectionWaitLimit.
func waitForClose(t *testing.T, conn net.Conn) bool {
	t.Helper()
	if err := conn.SetReadDeadline(time.Now().Add(connectionWaitLimit)); err != nil {
		t.Fatal(err)
	}
	_, err := io.Copy(io.Discard, conn)
	if netErr, isNetErr := err.(net.Error); isNetErr && netErr.Timeout() {
		return false
	}
	return true
}

func TestServerSetsHeaderAndIdleTimeoutsButNoOverallDeadlines(t *testing.T) {
	s := newBareServer(t)
	if err := s.Start("127.0.0.1", "0", nil); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Stop() })

	if s.httpSrv.ReadHeaderTimeout != defaultReadHeaderTimeout || s.httpSrv.IdleTimeout != defaultIdleTimeout {
		t.Errorf("unexpected defaults: header %v, idle %v", s.httpSrv.ReadHeaderTimeout, s.httpSrv.IdleTimeout)
	}
	if s.httpSrv.MaxHeaderBytes != maxRequestHeaderBytes {
		t.Errorf("MaxHeaderBytes = %d", s.httpSrv.MaxHeaderBytes)
	}
	if s.httpSrv.ReadTimeout != 0 || s.httpSrv.WriteTimeout != 0 {
		t.Error("read and write timeouts would cut streams, uploads and downloads")
	}
}

func TestSlowHeaderConnectionIsClosed(t *testing.T) {
	s := startLimitedServer(t)

	conn, err := net.Dial("tcp", s.boundAddr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	if _, err := conn.Write([]byte("GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nX-Slow: ")); err != nil {
		t.Fatal(err)
	}

	if !waitForClose(t, conn) {
		t.Fatal("a connection that never finishes its headers must be closed")
	}
}

func TestIdleKeepAliveConnectionIsClosed(t *testing.T) {
	s := startLimitedServer(t)

	conn, err := net.Dial("tcp", s.boundAddr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	if _, err := conn.Write([]byte("GET /api/auth/status HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n")); err != nil {
		t.Fatal(err)
	}

	if !waitForClose(t, conn) {
		t.Fatal("an idle keep-alive connection must be closed")
	}
}

func TestOversizedHeadersAreRefused(t *testing.T) {
	s := startLimitedServer(t)

	request, err := http.NewRequest(http.MethodGet, "http://"+s.boundAddr+"/api/auth/status", nil)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("X-Padding", strings.Repeat("a", maxRequestHeaderBytes*2))
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusRequestHeaderFieldsTooLarge {
		t.Errorf("expected 431, got %d", response.StatusCode)
	}
}

func TestEventStreamOutlivesTheHeaderAndIdleTimeouts(t *testing.T) {
	s := startLimitedServer(t)

	request, err := http.NewRequest(http.MethodGet, "http://"+s.boundAddr+"/api/events", nil)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Authorization", "Bearer t")
	streamEnded := make(chan error, 1)
	go func() {
		response, err := http.DefaultClient.Do(request)
		if err == nil {
			_, err = io.Copy(io.Discard, response.Body)
			response.Body.Close()
		}
		streamEnded <- err
	}()

	deadline := time.Now().Add(connectionWaitLimit)
	for !s.hasStreamingClient() {
		if time.Now().After(deadline) {
			t.Fatal("event stream never connected")
		}
		runtime.Gosched()
	}

	select {
	case <-streamEnded:
		t.Fatal("the event stream must not be cut by the header or idle timeouts")
	case <-time.After(5 * shortConnectionLimit):
	}
	if !s.hasStreamingClient() {
		t.Error("the stream client disappeared")
	}
}
func TestLargeSlowBodyOutlivesTheHeaderAndIdleTimeouts(t *testing.T) {
	s := startLimitedServer(t)

	const paddingBytes = 900 << 10
	prefix := `{"username":"admin","password":"password","padding":"`
	suffix := `"}`
	reader, writer := io.Pipe()
	go func() {
		io.WriteString(writer, prefix)
		io.WriteString(writer, strings.Repeat("a", paddingBytes/2))
		<-time.After(5 * shortConnectionLimit)
		io.WriteString(writer, strings.Repeat("a", paddingBytes/2))
		io.WriteString(writer, suffix)
		writer.Close()
	}()

	request, err := http.NewRequest(http.MethodPost, "http://"+s.boundAddr+"/api/auth/login", reader)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("a body slower than the header timeout must still be accepted: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", response.StatusCode)
	}
}
