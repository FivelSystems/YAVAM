package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"yavam/pkg/manager"
)

func startTestServer(t *testing.T, onRestore func()) *Server {
	t.Helper()
	mgr := manager.NewManager(nil, nil, &TestServerConfigService{libraries: []string{"C:/Allowed"}})
	s := NewServer(context.Background(), mgr, &MockAuthService{validToken: "valid"}, mockAssets, "1.0.0", onRestore)
	s.SkipEvents = true
	if err := s.Start("0", []string{"C:/Allowed"}); err != nil {
		t.Fatalf("Start() failed: %v", err)
	}
	t.Cleanup(func() { s.Stop() })
	return s
}

func TestAPI_MutatingRoutesRequireAuth(t *testing.T) {
	restoreCalled := false
	s := startTestServer(t, func() { restoreCalled = true })

	for _, path := range []string{"/api/scan/cancel", "/api/restore"} {
		req := httptest.NewRequest(http.MethodPost, path, nil)
		w := httptest.NewRecorder()
		s.httpSrv.Handler.ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("%s without token: expected 401, got %d", path, w.Code)
		}
	}
	if restoreCalled {
		t.Error("restore callback must not run for unauthenticated requests")
	}
}

func TestAPI_AuthenticatedRestoreAndCancel(t *testing.T) {
	restoreCalled := false
	s := startTestServer(t, func() { restoreCalled = true })

	for _, path := range []string{"/api/scan/cancel", "/api/restore"} {
		req := httptest.NewRequest(http.MethodPost, path, nil)
		req.Header.Set("Authorization", "Bearer valid")
		w := httptest.NewRecorder()
		s.httpSrv.Handler.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Errorf("%s with token: expected 200, got %d", path, w.Code)
		}
	}
	if !restoreCalled {
		t.Error("restore callback should run for authenticated requests")
	}
}

func oversizedJSONBody() string {
	return `{"username":"` + strings.Repeat("a", maxJSONBodyBytes+1) + `"}`
}

func TestAPI_OversizedJSONBodyRejected(t *testing.T) {
	s := startTestServer(t, func() {})

	tests := []struct {
		path          string
		authenticated bool
	}{
		{"/api/auth/login", false},
		{"/api/toggle", true},
	}

	for _, tt := range tests {
		req := httptest.NewRequest(http.MethodPost, tt.path, strings.NewReader(oversizedJSONBody()))
		if tt.authenticated {
			req.Header.Set("Authorization", "Bearer valid")
		}
		w := httptest.NewRecorder()
		s.httpSrv.Handler.ServeHTTP(w, req)
		if w.Code != http.StatusRequestEntityTooLarge {
			t.Errorf("%s oversized body: expected 413, got %d", tt.path, w.Code)
		}
	}
}

func TestDecodeJSONBody_MalformedIsBadRequest(t *testing.T) {
	s := &Server{}
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader("{not json"))
	w := httptest.NewRecorder()
	var destination struct{}
	if s.decodeJSONBody(w, req, &destination) {
		t.Fatal("expected decode failure")
	}
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}
