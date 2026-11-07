package server

import (
	"bufio"
	"bytes"
	"context"
	"io"
	"mime/multipart"
	"net"
	"net/http"
	"strings"
	"testing"
	"time"
	"yavam/pkg/manager"
)

const (
	shortBodyLimit = 150 * time.Millisecond
	slowBodyPause  = 4 * shortBodyLimit
)

func startBodyDeadlineServer(t *testing.T, libraryDir string) *Server {
	t.Helper()
	mgr := manager.NewManager(nil, nil, &TestServerConfigService{libraries: []string{libraryDir}})
	s := NewServer(context.Background(), mgr, &MockAuthService{validToken: "valid"}, mockAssets, "1.0.0", func() {})
	s.SkipEvents = true
	s.jsonBodyReadTimeout = shortBodyLimit
	if err := s.Start("127.0.0.1", "0", []string{libraryDir}); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Stop() })
	return s
}

func TestJSONBody_TrickledBodyIsCutAtTheDeadline(t *testing.T) {
	s := startBodyDeadlineServer(t, t.TempDir())

	conn, err := net.Dial("tcp", s.boundAddr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	head := "POST /api/auth/login HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: 1000\r\n\r\n{"
	if _, err := conn.Write([]byte(head)); err != nil {
		t.Fatal(err)
	}

	if err := conn.SetReadDeadline(time.Now().Add(connectionWaitLimit)); err != nil {
		t.Fatal(err)
	}
	started := time.Now()
	response, err := http.ReadResponse(bufio.NewReader(conn), nil)
	if err != nil {
		t.Fatalf("expected an error response once the deadline passed, got %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusRequestTimeout {
		t.Errorf("expected 408, got %d", response.StatusCode)
	}
	if elapsed := time.Since(started); elapsed > connectionWaitLimit/2 {
		t.Errorf("the connection was held for %v", elapsed)
	}
}

func TestJSONBody_PromptRequestIsUnaffectedAndConnectionIsReusable(t *testing.T) {
	s := startBodyDeadlineServer(t, t.TempDir())
	client := &http.Client{Timeout: connectionWaitLimit}

	for attempt := 0; attempt < 2; attempt++ {
		response, err := client.Post("http://"+s.boundAddr+"/api/auth/login", "application/json",
			strings.NewReader(`{"username":"admin","password":"password"}`))
		if err != nil {
			t.Fatal(err)
		}
		io.Copy(io.Discard, response.Body)
		response.Body.Close()
		if response.StatusCode != http.StatusOK {
			t.Fatalf("attempt %d: expected 200, got %d", attempt, response.StatusCode)
		}
		time.Sleep(2 * shortBodyLimit)
	}
}

func TestJSONBody_SlowLegitimateUploadIsNotCut(t *testing.T) {
	library := t.TempDir()
	s := startBodyDeadlineServer(t, library)

	reader, writer := io.Pipe()
	form := multipart.NewWriter(writer)
	go func() {
		var failure error
		defer func() { writer.CloseWithError(failure) }()
		if failure = form.WriteField("path", library); failure != nil {
			return
		}
		part, err := form.CreateFormFile("file", "A.B.1.var")
		if err != nil {
			failure = err
			return
		}
		part.Write(bytes.Repeat([]byte("a"), 64<<10))
		time.Sleep(slowBodyPause)
		part.Write(bytes.Repeat([]byte("a"), 64<<10))
		failure = form.Close()
	}()

	request, err := http.NewRequest(http.MethodPost, "http://"+s.boundAddr+"/api/upload", reader)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Content-Type", form.FormDataContentType())
	request.Header.Set("Authorization", "Bearer valid")
	response, err := (&http.Client{Timeout: connectionWaitLimit}).Do(request)
	if err != nil {
		t.Fatalf("an upload slower than the JSON body deadline must complete: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", response.StatusCode)
	}
}
