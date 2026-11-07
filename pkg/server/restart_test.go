package server

import (
	"context"
	"net"
	"net/http"
	"runtime"
	"testing"
	"time"
	"yavam/pkg/manager"
	"yavam/pkg/services/config"
)

const streamWaitLimit = 5 * time.Second

func newBareServer(t *testing.T) *Server {
	t.Helper()
	mgr := manager.NewManager(nil, nil, &MockConfigService{config: &config.Config{}})
	s := NewServer(context.Background(), mgr, &MockAuthService{validToken: "t"}, mockAssets, "1.0.0", func() {})
	s.SkipEvents = true
	return s
}

func TestStopThenStartRebindsToTheNewHost(t *testing.T) {
	s := newBareServer(t)
	if err := s.Start("127.0.0.1", "0", nil); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Stop() })

	if err := s.Stop(); err != nil {
		t.Fatalf("Stop: %v", err)
	}
	if err := s.Start("127.0.0.2", "0", nil); err != nil {
		t.Fatalf("Start after Stop: %v", err)
	}

	host, _, err := net.SplitHostPort(s.boundAddr)
	if err != nil || host != "127.0.0.2" {
		t.Fatalf("restart must honour the new host, got %q (%v)", s.boundAddr, err)
	}
	if !s.IsRunning() {
		t.Error("server must be running after the restart")
	}
}

func TestStopClosesStreamsThatOutliveTheGracePeriod(t *testing.T) {
	s := newBareServer(t)
	s.shutdownGracePeriod = 20 * time.Millisecond
	if err := s.Start("127.0.0.1", "0", nil); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Stop() })

	request, err := http.NewRequest(http.MethodGet, "http://"+s.boundAddr+"/api/events", nil)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Authorization", "Bearer t")
	streamEnded := make(chan error, 1)
	go func() {
		response, err := http.DefaultClient.Do(request)
		if err == nil {
			response.Body.Close()
		}
		streamEnded <- err
	}()

	deadline := time.Now().Add(streamWaitLimit)
	for !s.hasStreamingClient() {
		if time.Now().After(deadline) {
			t.Fatal("event stream never connected")
		}
		runtime.Gosched()
	}

	if err := s.Stop(); err != nil {
		t.Fatalf("Stop: %v", err)
	}

	select {
	case err := <-streamEnded:
		if err == nil {
			t.Fatal("the stream must be cut when the server stops")
		}
	case <-time.After(streamWaitLimit):
		t.Fatal("stream survived Stop: it would keep being served on the old address")
	}
}

func (s *Server) hasStreamingClient() bool {
	s.clientsMu.Lock()
	defer s.clientsMu.Unlock()
	return len(s.clients) > 0
}
