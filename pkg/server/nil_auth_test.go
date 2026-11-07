package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"yavam/pkg/manager"
)

func assertAuthUnavailable(t *testing.T, rec *httptest.ResponseRecorder) {
	t.Helper()
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
	var body struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("response is not JSON: %v", err)
	}
	if body.Success || body.Message != messageAuthUnavailable {
		t.Fatalf("unexpected body: %+v", body)
	}
}

func serveWithoutAuth(t *testing.T, handler http.Handler, method, target string) *httptest.ResponseRecorder {
	t.Helper()
	req := newTestRequest(method, target, strings.NewReader("{}"))
	req.Header.Set("Authorization", "Bearer any")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	return rec
}

func TestNilAuthMiddlewaresReturnUnavailable(t *testing.T) {
	s := &Server{}
	reached := false
	next := http.HandlerFunc(func(http.ResponseWriter, *http.Request) { reached = true })

	cases := map[string]http.Handler{
		"AuthMiddleware":           s.AuthMiddleware(next),
		"NonSlidingAuthMiddleware": s.NonSlidingAuthMiddleware(next),
		"eventsAuthMiddleware":     s.eventsAuthMiddleware(next),
	}
	for name, handler := range cases {
		t.Run(name, func(t *testing.T) {
			assertAuthUnavailable(t, serveWithoutAuth(t, handler, http.MethodGet, "/api/anything"))
		})
	}
	if reached {
		t.Fatal("protected handler must not run without an auth service")
	}
}

func TestNilAuthEventTicketEndpointReturnsUnavailable(t *testing.T) {
	s := &Server{}
	assertAuthUnavailable(t, serveWithoutAuth(t, http.HandlerFunc(s.handleEventTicket), http.MethodPost, "/api/events/ticket"))
}

func TestNilAuthSessionRoutesReturnUnavailable(t *testing.T) {
	mgr := manager.NewManager(nil, nil, &TestServerConfigService{libraries: []string{t.TempDir()}})
	s := NewServer(context.Background(), mgr, nil, mockAssets, "1.0.0", func() {})
	s.SkipEvents = true
	if err := s.Start("127.0.0.1", "0", nil); err != nil {
		t.Fatalf("Start() failed: %v", err)
	}
	t.Cleanup(func() { s.Stop() })

	for _, route := range []struct{ method, path string }{
		{http.MethodGet, "/api/auth/sessions"},
		{http.MethodPost, "/api/auth/revoke"},
	} {
		assertAuthUnavailable(t, serveWithoutAuth(t, s.httpSrv.Handler, route.method, route.path))
	}
}
