package server

import (
	"context"
	"embed"
	"net/http/httptest"
	"strings"
	"testing"
)

// Mock assets
var mockAssets embed.FS

// Note: MockAuthService is available from middleware_test.go (same package)

func TestStartServer(t *testing.T) {
	// We can pass nil manager because Start() doesn't use it, only handlers do.
	// We just want to test the Start() logic itself (ports, running state)

	// Mock Auth
	mockAuth := &MockAuthService{validToken: "valid"}

	s := NewServer(context.Background(), nil, mockAuth, mockAssets, "1.0.0", func() {})
	s.SkipEvents = true

	// Test 1: Start with valid path
	err := s.Start("0", "C:/tmp", []string{"C:/tmp"}) // Port 0 for random free port
	if err != nil {
		t.Fatalf("Start() failed with valid path: %v", err)
	}
	if !s.IsRunning() {
		t.Error("Server should be running")
	}

	// Stop it (simulate) - generic Server doesn't have Stop?
	// Wails App wrapper handles lifecycle usually?
	// server.go has Shutdown? I need to check.
	// Assuming for this test we might need a fresh server or check if Start fails if running.
	err = s.Start("0", "C:/tmp", nil)
	if err == nil || err.Error() != "server is already running" {
		t.Error("Start() should fail if already running")
	}
}

func TestStartServer_EmptyPath(t *testing.T) {
	mockAuth := &MockAuthService{validToken: "valid"}
	s := NewServer(context.Background(), nil, mockAuth, mockAssets, "1.0.0", func() {})
	s.SkipEvents = true

	// Test 2: Start with empty path (Should succeed now)
	err := s.Start("0", "", []string{})
	if err != nil {
		t.Fatalf("Start() failed with empty path: %v", err)
	}
}

func TestAPI_EmptyPathSecurity(t *testing.T) {
	mockAuth := &MockAuthService{validToken: "valid"}

	// We pass nil manager. If the security check fails properly, manager won't be called.
	// If it FAILS to block, it will panic on nil manager, which is also a test failure (sort of).
	s := NewServer(context.Background(), nil, mockAuth, mockAssets, "1.0.0", func() {})
	s.SkipEvents = true

	// Start with empty path
	s.Start("0", "", []string{})

	// Construct Request to /api/packages
	req := httptest.NewRequest("GET", "/api/packages", nil)
	// Add Auth Token (to bypass auth middleware)
	req.Header.Set("Authorization", "Bearer valid")

	w := httptest.NewRecorder()

	// We need to serve via the mux created in Start?
	// s.Start creates a new mux but doesn't expose it easily unless we assign it to s.httpSrv.Handler
	// But Start() starts ListenAndServe in a goroutine?
	// Wait, checking server.go implementation...
	// Start() creates mux and assigns it to s.httpSrv.Handler.
	// But it starts httpSrv.Serve in a goroutine?
	// Actually for testing handlers, we prefer not to rely on network.
	// But the handlers are defined INSIDE Start() closures.
	// So we can't access them individually easily unless we access s.httpSrv.Handler.

	// Assuming SafeToAutoRun logic executed Start completely before we reach here.
	if s.httpSrv == nil || s.httpSrv.Handler == nil {
		t.Fatal("Server handler not initialized")
	}

	s.httpSrv.Handler.ServeHTTP(w, req)

	// Expect 400 Bad Request (No library path selected)
	if w.Code != 400 {
		t.Errorf("Expected 400 Bad Request for empty path, got %d. Body: %s", w.Code, w.Body.String())
	}

	if !strings.Contains(w.Body.String(), "No library path selected") {
		t.Errorf("Expected error message about library path, got: %s", w.Body.String())
	}
}

func TestAPI_ExplicitPathSecurity(t *testing.T) {
	mockAuth := &MockAuthService{validToken: "valid"}
	s := NewServer(context.Background(), nil, mockAuth, mockAssets, "1.0.0", func() {})
	s.SkipEvents = true

	// Start with empty path
	s.Start("0", "", []string{"C:/Allowed"})

	// Request with explicit path parameter that IS allowed
	// But we have nil manager, so if it passes security, it will crash.
	// We just want to check it DOES NOT return 400 "No library path selected"
	// It should return 500 (because manager is nil) or similar panic.
	// To safely test this without panic, we'd need a mock manager.
	// But for this specific "Invalid Path" bug, verifying the BLOCKING of empty path is most important.

	// Let's test blocking of unsafe path
	req := httptest.NewRequest("GET", "/api/packages?path=C:/Secrets", nil)
	req.Header.Set("Authorization", "Bearer valid")
	w := httptest.NewRecorder()

	s.httpSrv.Handler.ServeHTTP(w, req)

	// Should be 403 Forbidden
	if w.Code != 403 {
		t.Errorf("Expected 403 Forbidden for unsafe path, got %d", w.Code)
	}
}
