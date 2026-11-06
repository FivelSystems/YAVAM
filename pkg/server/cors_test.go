package server

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

const testServerHost = "192.168.1.10:8080"

func newCORSTestRequest(method, origin string) *http.Request {
	request := httptest.NewRequest(method, "http://"+testServerHost+"/api/ping", nil)
	if origin != "" {
		request.Header.Set(headerOrigin, origin)
	}
	return request
}

func serveWithCORS(request *http.Request) *httptest.ResponseRecorder {
	server := &Server{}
	handler := server.corsMiddleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	return recorder
}

func TestCORSSameOriginAllowed(t *testing.T) {
	origin := "http://" + testServerHost
	recorder := serveWithCORS(newCORSTestRequest(http.MethodGet, origin))

	if got := recorder.Header().Get(headerAllowOrigin); got != origin {
		t.Fatalf("expected allow-origin %q, got %q", origin, got)
	}
	if recorder.Code != http.StatusNoContent {
		t.Fatalf("expected handler to run, got status %d", recorder.Code)
	}
}

func TestCORSForeignOriginGetsNoHeaders(t *testing.T) {
	foreignOrigins := []string{
		"http://example.com",
		"http://192.168.1.10:9999",
		"https://" + testServerHost,
		"http://192.168.1.10:8080.example.com",
		"null",
		"http://localhost:5173",
	}
	for _, origin := range foreignOrigins {
		recorder := serveWithCORS(newCORSTestRequest(http.MethodGet, origin))
		for _, header := range []string{headerAllowOrigin, headerAllowMethods, headerAllowHeaders} {
			if got := recorder.Header().Get(header); got != "" {
				t.Errorf("origin %q: unexpected %s %q", origin, header, got)
			}
		}
	}
}

func TestCORSNeverEmitsWildcard(t *testing.T) {
	for _, origin := range []string{"", "http://" + testServerHost, "http://example.com"} {
		recorder := serveWithCORS(newCORSTestRequest(http.MethodGet, origin))
		if got := recorder.Header().Get(headerAllowOrigin); got == "*" {
			t.Errorf("origin %q: wildcard emitted", origin)
		}
	}
}

func TestCORSNoOriginHeaderUnaffected(t *testing.T) {
	recorder := serveWithCORS(newCORSTestRequest(http.MethodGet, ""))

	if recorder.Code != http.StatusNoContent {
		t.Fatalf("expected handler to run, got status %d", recorder.Code)
	}
	if got := recorder.Header().Get(headerAllowOrigin); got != "" {
		t.Fatalf("unexpected allow-origin %q", got)
	}
}

func TestCORSPreflightSameOrigin(t *testing.T) {
	origin := "http://" + testServerHost
	recorder := serveWithCORS(newCORSTestRequest(http.MethodOptions, origin))

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", recorder.Code)
	}
	if got := recorder.Header().Get(headerAllowOrigin); got != origin {
		t.Fatalf("expected allow-origin %q, got %q", origin, got)
	}
	if recorder.Header().Get(headerAllowMethods) == "" {
		t.Fatal("expected allow-methods on accepted preflight")
	}
}

func TestCORSPreflightForeignOriginRejected(t *testing.T) {
	recorder := serveWithCORS(newCORSTestRequest(http.MethodOptions, "http://example.com"))

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", recorder.Code)
	}
	if got := recorder.Header().Get(headerAllowOrigin); got != "" {
		t.Fatalf("unexpected allow-origin %q", got)
	}
}

func TestCORSPreflightWithoutOriginStillOK(t *testing.T) {
	recorder := serveWithCORS(newCORSTestRequest(http.MethodOptions, ""))

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", recorder.Code)
	}
}
