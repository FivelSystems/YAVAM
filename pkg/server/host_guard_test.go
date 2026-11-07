package server

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"
	"yavam/pkg/services/auth"
	"yavam/pkg/services/config"
)

const (
	testMachineName = "studio-rig"
	foreignHost     = "evil.example"
	statusRoute     = "/api/auth/status"
)

func newHostGuardServer(t *testing.T, cfg *config.Config) *Server {
	t.Helper()
	s, _ := startAuthServer(t, &scriptedAuth{passwordSet: true}, cfg)
	s.machineNames = map[string]bool{testMachineName: true, testMachineName + mDNSSuffix: true}
	return s
}

func statusWithHost(s *Server, host string) *httptest.ResponseRecorder {
	return do(s, http.MethodGet, statusRoute, "", loopbackPeer, map[string]string{"Host": host})
}

func TestHostGuard_AcceptsIPsLocalhostAndMachineName(t *testing.T) {
	s := newHostGuardServer(t, &config.Config{})

	accepted := []string{
		"127.0.0.1:18888", "127.0.0.1", "[::1]:18888", "[::1]", "192.168.1.10:18888", "[2001:db8::1]:80",
		"localhost", "LOCALHOST:8080", "localhost.",
		testMachineName, "Studio-Rig:18888", testMachineName + ".local", testMachineName + ".local:18888",
	}
	for _, host := range accepted {
		if w := statusWithHost(s, host); w.Code != http.StatusOK {
			t.Errorf("Host %q: expected 200, got %d", host, w.Code)
		}
	}
}

func TestHostGuard_RejectsUnrecognisedNames(t *testing.T) {
	s := newHostGuardServer(t, &config.Config{})

	rejected := []string{
		foreignHost, foreignHost + ":18888", "localhost." + foreignHost, testMachineName + "." + foreignHost,
		testMachineName + ".local." + foreignHost, "127.0.0.1." + foreignHost, "",
	}
	for _, host := range rejected {
		w := statusWithHost(s, host)
		if w.Code != http.StatusMisdirectedRequest {
			t.Errorf("Host %q: expected 421, got %d", host, w.Code)
		}
		body := decodeBody(t, w)
		if body["success"] != false || body["message"] != messageRequestNotAllowed {
			t.Errorf("Host %q: unexpected body %v", host, body)
		}
	}
}

func TestHostGuard_HonoursConfiguredExtraHosts(t *testing.T) {
	s := newHostGuardServer(t, &config.Config{ServerAllowedHosts: []string{"yavam.home.lan"}})

	for _, host := range []string{"yavam.home.lan", "YAVAM.home.lan:18888"} {
		if w := statusWithHost(s, host); w.Code != http.StatusOK {
			t.Errorf("Host %q: expected 200, got %d", host, w.Code)
		}
	}
	if w := statusWithHost(s, "other.home.lan"); w.Code != http.StatusMisdirectedRequest {
		t.Errorf("unlisted name: expected 421, got %d", w.Code)
	}
}

func TestHostGuard_AppliesToEveryRoute(t *testing.T) {
	s := newHostGuardServer(t, &config.Config{})

	for _, path := range []string{"/", "/api/auth/login", "/api/config", "/files/?path=x"} {
		w := do(s, http.MethodGet, path, "", loopbackPeer, map[string]string{"Host": foreignHost})
		if w.Code != http.StatusMisdirectedRequest {
			t.Errorf("%s: expected 421, got %d", path, w.Code)
		}
	}
}

func TestHostGuard_OriginHandling(t *testing.T) {
	s := newHostGuardServer(t, &config.Config{})
	sameOrigin := "http://" + testLocalHost

	cases := []struct {
		name         string
		method       string
		origin       string
		wantStatus   int
		wantAllowACA bool
	}{
		{"same origin", http.MethodGet, sameOrigin, http.StatusOK, true},
		{"no origin", http.MethodGet, "", http.StatusOK, false},
		{"other port on an allowed host is not same-origin", http.MethodGet, "http://localhost:5173", http.StatusOK, false},
		{"foreign origin", http.MethodGet, "http://" + foreignHost, http.StatusForbidden, false},
		{"opaque origin", http.MethodGet, "null", http.StatusForbidden, false},
		{"foreign origin posting", http.MethodPost, "http://" + foreignHost, http.StatusForbidden, false},
		{"same-origin preflight", http.MethodOptions, sameOrigin, http.StatusOK, true},
		{"foreign preflight", http.MethodOptions, "http://" + foreignHost, http.StatusForbidden, false},
		{"allowed-host preflight, other origin", http.MethodOptions, "http://localhost:5173", http.StatusForbidden, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w := do(s, tc.method, statusRoute, "", loopbackPeer, map[string]string{headerOrigin: tc.origin})
			if w.Code != tc.wantStatus {
				t.Errorf("expected %d, got %d", tc.wantStatus, w.Code)
			}
			if got := w.Header().Get(headerAllowOrigin) != ""; got != tc.wantAllowACA {
				t.Errorf("Access-Control-Allow-Origin present = %v, want %v", got, tc.wantAllowACA)
			}
		})
	}
}

func TestHostGuard_LoopbackListenerStillServesLocalClients(t *testing.T) {
	s, _ := startAuthServer(t, &scriptedAuth{passwordSet: true}, &config.Config{})

	client := &http.Client{Timeout: 5 * time.Second}
	response, err := client.Get("http://" + s.boundAddr + statusRoute)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 over a real loopback connection, got %d", response.StatusCode)
	}
}

func TestJSONContentType_RequiredOnUnauthenticatedPosts(t *testing.T) {
	s, _ := startAuthServer(t, &scriptedAuth{MockAuthService: MockAuthService{validToken: "t"}, passwordSet: true}, &config.Config{})

	for _, route := range []string{"/api/auth/login", "/api/auth/pair", "/api/auth/challenge"} {
		for _, contentType := range []string{"text/plain", "text/plain;charset=UTF-8", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x", "application/jsonp", ""} {
			w := do(s, http.MethodPost, route, loginBody, remotePeer, map[string]string{"Content-Type": contentType})
			if w.Code != http.StatusUnsupportedMediaType {
				t.Errorf("%s with %q: expected 415, got %d", route, contentType, w.Code)
				continue
			}
			if body := decodeBody(t, w); body["success"] != false || body["message"] != messageJSONRequired {
				t.Errorf("%s with %q: unexpected body %v", route, contentType, body)
			}
		}
	}
}

func TestJSONContentType_AcceptsMediaTypeWithParametersAndAnyCase(t *testing.T) {
	s, _ := startAuthServer(t, &scriptedAuth{MockAuthService: MockAuthService{validToken: "t"}, passwordSet: true}, &config.Config{})

	for _, contentType := range []string{"application/json", "application/json; charset=utf-8", "Application/JSON"} {
		w := do(s, http.MethodPost, "/api/auth/login", loginBody, loopbackPeer, map[string]string{"Content-Type": contentType})
		if w.Code != http.StatusOK {
			t.Errorf("%q: expected 200, got %d", contentType, w.Code)
		}
	}
}

func TestJSONContentType_OtherMethodsStillGet405(t *testing.T) {
	s, _ := startAuthServer(t, &scriptedAuth{passwordSet: true}, &config.Config{})

	if w := do(s, http.MethodGet, "/api/auth/login", "", remotePeer, nil); w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", w.Code)
	}
}

func TestBlindCrossSitePostDoesNotMoveLoginThrottleOrLimiter(t *testing.T) {
	s, _ := startAuthServer(t, &scriptedAuth{MockAuthService: MockAuthService{validToken: "t"}, passwordSet: true}, &config.Config{})

	for i := 0; i < 20; i++ {
		w := do(s, http.MethodPost, "/api/auth/login", "not even json", loopbackPeer, map[string]string{"Content-Type": "text/plain"})
		if w.Code != http.StatusUnsupportedMediaType {
			t.Fatalf("expected 415, got %d", w.Code)
		}
	}
	if failures := throttleFailures(s.loopbackLoginThrottle); failures != 0 {
		t.Errorf("loopback throttle charged %d times by rejected requests", failures)
	}
	if w := do(s, http.MethodPost, "/api/auth/login", loginBody, loopbackPeer, nil); w.Code != http.StatusOK {
		t.Errorf("a real login straight after must be admitted, got %d", w.Code)
	}
}

func TestMalformedJSONLoginDoesNotMoveLoginThrottle(t *testing.T) {
	s, _ := startAuthServer(t, &scriptedAuth{MockAuthService: MockAuthService{validToken: "t"}, passwordSet: true}, &config.Config{})

	if w := do(s, http.MethodPost, "/api/auth/login", "{not json", loopbackPeer, nil); w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
	if failures := throttleFailures(s.loopbackLoginThrottle); failures != 0 {
		t.Errorf("malformed body charged the throttle %d times", failures)
	}
}

func TestBlindCrossSitePairDoesNotCountAsPairingFailure(t *testing.T) {
	svc, err := auth.NewSimpleAuthServiceWithClock(filepath.Join(t.TempDir(), "auth.json"), time.Now)
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.SetPassword(adminSecret); err != nil {
		t.Fatal(err)
	}
	s, _ := startAuthServer(t, svc, &config.Config{})
	issued, err := svc.CreatePairingCode(time.Minute)
	if err != nil {
		t.Fatal(err)
	}

	blind := `{"code":"ZZZZ-ZZZZ","deviceName":"x"}`
	for i := 0; i < auth.MaxPairingFailures*2; i++ {
		w := do(s, http.MethodPost, "/api/auth/pair", blind, remotePeer, map[string]string{"Content-Type": "text/plain"})
		if w.Code != http.StatusUnsupportedMediaType {
			t.Fatalf("expected 415, got %d", w.Code)
		}
	}

	body := `{"code":"` + issued.Code + `","deviceName":"phone"}`
	if w := do(s, http.MethodPost, "/api/auth/pair", body, remotePeer, nil); w.Code != http.StatusOK {
		t.Fatalf("the outstanding code must survive blind posts, got %d %s", w.Code, strings.TrimSpace(w.Body.String()))
	}
}

func throttleFailures(throttle *LoginThrottle) int {
	throttle.mu.Lock()
	defer throttle.mu.Unlock()
	return throttle.failures
}
