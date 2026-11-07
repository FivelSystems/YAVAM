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
	if err := s.Start("127.0.0.1", "0", []string{"C:/Allowed"}); err != nil {
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

// unauthenticatedRoutes is the complete set of routes reachable without a
// token. Adding a route here is a deliberate security decision.
var unauthenticatedRoutes = []struct {
	method string
	path   string
	body   string
}{
	{http.MethodPost, "/api/auth/login", loginBody},
	{http.MethodPost, "/api/auth/pair", `{"code":"ABCD-2345"}`},
	{http.MethodGet, "/api/auth/status", ""},
}

func TestAPI_UnauthenticatedRoutesNeedNoToken(t *testing.T) {
	for _, route := range unauthenticatedRoutes {
		s := startTestServer(t, func() {})
		w := do(s, route.method, route.path, route.body, "127.0.0.1:50000", nil)
		if route.path == "/api/auth/status" && w.Code != http.StatusOK {
			t.Errorf("%s %s must answer 200 without authentication, got %d", route.method, route.path, w.Code)
		}
		if w.Code == http.StatusNotFound {
			t.Errorf("%s %s is not registered", route.method, route.path)
		}
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
		req.RemoteAddr = "127.0.0.1:50000"
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
