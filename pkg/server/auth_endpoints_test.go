package server

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
	"unicode"
	"yavam/pkg/manager"
	"yavam/pkg/services/auth"
	"yavam/pkg/services/config"
)

const (
	remotePeer   = "192.0.2.10:40000"
	loopbackPeer = "127.0.0.1:40000"
	adminSecret  = "correct-horse-battery"

	testLocalHost = "127.0.0.1:18888"
)

// scriptedAuth overrides the pieces of MockAuthService the gates depend on.
type scriptedAuth struct {
	MockAuthService
	passwordSet bool
	redeemToken string
	redeemErr   error
}

func (a *scriptedAuth) HasCustomPassword() bool { return a.passwordSet }

func (a *scriptedAuth) RedeemPairingCode(code, deviceName string) (string, error) {
	return a.redeemToken, a.redeemErr
}

type logCapture struct {
	mu    sync.Mutex
	lines []string
}

func (c *logCapture) add(message string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.lines = append(c.lines, message)
}

func (c *logCapture) joined() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return strings.Join(c.lines, "\n")
}

func startAuthServer(t *testing.T, authService auth.AuthService, cfg *config.Config) (*Server, *logCapture) {
	t.Helper()
	mgr := manager.NewManager(nil, nil, &MockConfigService{config: cfg})
	s := NewServer(context.Background(), mgr, authService, mockAssets, "1.0.0", func() {})
	s.SkipEvents = true
	logs := &logCapture{}
	s.logObserver = logs.add
	if err := s.Start("127.0.0.1", "0", nil); err != nil {
		t.Fatalf("Start() failed: %v", err)
	}
	t.Cleanup(func() { s.Stop() })
	return s, logs
}

func do(s *Server, method, path, body, remoteAddr string, headers map[string]string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.RemoteAddr = remoteAddr
	req.Host = testLocalHost
	if method == http.MethodPost {
		req.Header.Set("Content-Type", "application/json")
	}
	for name, value := range headers {
		if strings.EqualFold(name, "Host") {
			req.Host = value
			continue
		}
		if value == "" {
			req.Header.Del(name)
			continue
		}
		req.Header.Set(name, value)
	}
	w := httptest.NewRecorder()
	s.httpSrv.Handler.ServeHTTP(w, req)
	return w
}

func decodeBody(t *testing.T, w *httptest.ResponseRecorder) map[string]interface{} {
	t.Helper()
	var body map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("response is not JSON: %v (%q)", err, w.Body.String())
	}
	return body
}

const loginBody = `{"username":"admin","password":"password","deviceName":"phone"}`

func TestLogin_RefusedWhileDefaultPassword(t *testing.T) {
	s, _ := startAuthServer(t, &scriptedAuth{MockAuthService: MockAuthService{validToken: "t"}}, &config.Config{AllowRemotePasswordLogin: true})

	for _, peer := range []string{loopbackPeer, remotePeer} {
		w := do(s, http.MethodPost, "/api/auth/login", loginBody, peer, nil)
		if w.Code != http.StatusServiceUnavailable {
			t.Errorf("peer %s: expected 503, got %d", peer, w.Code)
		}
	}
}

func TestLogin_RemoteRefusedWhenFlagOff(t *testing.T) {
	s, _ := startAuthServer(t, &scriptedAuth{MockAuthService: MockAuthService{validToken: "t"}, passwordSet: true}, &config.Config{})

	w := do(s, http.MethodPost, "/api/auth/login", loginBody, remotePeer, nil)
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", w.Code)
	}
	if !strings.Contains(decodeBody(t, w)["message"].(string), "Pair") {
		t.Error("403 message must point to pairing")
	}
}

func TestLogin_LoopbackWorksWhenFlagOff(t *testing.T) {
	s, _ := startAuthServer(t, &scriptedAuth{MockAuthService: MockAuthService{validToken: "t"}, passwordSet: true}, &config.Config{})

	w := do(s, http.MethodPost, "/api/auth/login", loginBody, loopbackPeer, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

func TestLogin_RemoteWorksWhenFlagOn(t *testing.T) {
	s, _ := startAuthServer(t, &scriptedAuth{MockAuthService: MockAuthService{validToken: "t"}, passwordSet: true}, &config.Config{AllowRemotePasswordLogin: true})

	w := do(s, http.MethodPost, "/api/auth/login", loginBody, remotePeer, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

func TestForwardingHeadersDoNotMakeARemoteClientLoopback(t *testing.T) {
	s, _ := startAuthServer(t, &scriptedAuth{MockAuthService: MockAuthService{validToken: "t"}, passwordSet: true}, &config.Config{})

	spoofed := map[string]string{
		"X-Forwarded-For": "127.0.0.1",
		"X-Real-IP":       "127.0.0.1",
		"Forwarded":       "for=127.0.0.1",
		"Host":            "localhost",
	}
	w := do(s, http.MethodPost, "/api/auth/login", loginBody, remotePeer, spoofed)
	if w.Code != http.StatusForbidden {
		t.Fatalf("spoofed headers must not bypass the remote gate: got %d", w.Code)
	}

	status := do(s, http.MethodGet, "/api/auth/status", "", remotePeer, spoofed)
	if decodeBody(t, status)["passwordLoginAllowed"] != false {
		t.Error("status must not treat a spoofed header as loopback")
	}
}

func TestRateLimiterKeysOnPeerAddressNotHeaders(t *testing.T) {
	s, _ := startAuthServer(t, &scriptedAuth{MockAuthService: MockAuthService{validToken: "t"}, passwordSet: true}, &config.Config{})

	var last int
	for i := 0; i < 6; i++ {
		headers := map[string]string{"X-Forwarded-For": "198.51.100." + string(rune('1'+i))}
		last = do(s, http.MethodPost, "/api/auth/pair", `{"code":"AAAA-BBBB","deviceName":"d"}`, remotePeer, headers).Code
	}
	if last != http.StatusTooManyRequests {
		t.Errorf("varying X-Forwarded-For must not evade the limiter: got %d", last)
	}
}

func TestPair_Success(t *testing.T) {
	s, logs := startAuthServer(t, &scriptedAuth{passwordSet: true, redeemToken: "session-token-value"}, &config.Config{})

	w := do(s, http.MethodPost, "/api/auth/pair", `{"code":"ABCD-2345","deviceName":"phone"}`, remotePeer, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	body := decodeBody(t, w)
	if body["success"] != true || body["token"] != "session-token-value" || len(body) != 2 {
		t.Errorf("unexpected body: %v", body)
	}
	if strings.Contains(logs.joined(), "session-token-value") || strings.Contains(logs.joined(), "ABCD-2345") {
		t.Errorf("logs leaked token or code: %q", logs.joined())
	}
}

func TestPair_IdenticalFailureForWrongExpiredAndUsedCodes(t *testing.T) {
	clock := &serverTestClock{current: time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)}
	svc, err := auth.NewSimpleAuthServiceWithClock(filepath.Join(t.TempDir(), "auth.json"), clock.Now)
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.SetPassword(adminSecret); err != nil {
		t.Fatal(err)
	}
	s, logs := startAuthServer(t, svc, &config.Config{})

	pair := func(peer, code string) *httptest.ResponseRecorder {
		return do(s, http.MethodPost, "/api/auth/pair", `{"code":"`+code+`","deviceName":"phone"}`, peer, nil)
	}

	noneOutstanding := pair("192.0.2.11:1", "ZZZZ-ZZZZ")

	issued, err := svc.CreatePairingCode(time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	wrong := pair("192.0.2.12:1", "ZZZZ-ZZZZ")

	ok := pair("192.0.2.13:1", issued.Code)
	if ok.Code != http.StatusOK {
		t.Fatalf("valid code must redeem, got %d", ok.Code)
	}
	used := pair("192.0.2.14:1", issued.Code)

	expiring, _ := svc.CreatePairingCode(time.Minute)
	clock.advance(2 * time.Minute)
	expired := pair("192.0.2.15:1", expiring.Code)

	for name, w := range map[string]*httptest.ResponseRecorder{
		"none outstanding": noneOutstanding, "wrong": wrong, "used": used, "expired": expired,
	} {
		if w.Code != http.StatusUnauthorized {
			t.Errorf("%s: expected 401, got %d", name, w.Code)
		}
		if w.Body.String() != wrong.Body.String() {
			t.Errorf("%s: body differs from wrong-code body: %q vs %q", name, w.Body.String(), wrong.Body.String())
		}
	}
	if got := decodeBody(t, wrong); got["success"] != false || got["message"] != "Invalid or expired code" {
		t.Errorf("unexpected failure body: %v", got)
	}

	tokenFromResponse := decodeBody(t, ok)["token"].(string)
	for _, secret := range []string{issued.Code, expiring.Code, tokenFromResponse} {
		if strings.Contains(logs.joined(), secret) {
			t.Errorf("logs leaked a secret: %q", logs.joined())
		}
	}
}

func TestPair_MalformedRequests(t *testing.T) {
	s, _ := startAuthServer(t, &scriptedAuth{passwordSet: true}, &config.Config{})

	bodies := []string{
		`{not json`,
		`{"deviceName":"phone"}`,
		`{"code":"` + strings.Repeat("A", 200) + `","deviceName":"phone"}`,
		`{"code":"ABCD-2345","deviceName":"` + strings.Repeat("d", 65) + `"}`,
	}
	for _, body := range bodies {
		w := do(s, http.MethodPost, "/api/auth/pair", body, remotePeer, nil)
		if w.Code != http.StatusBadRequest {
			t.Errorf("body %.40q: expected 400, got %d", body, w.Code)
		}
	}
}

func TestPair_RateLimited(t *testing.T) {
	s, _ := startAuthServer(t, &scriptedAuth{passwordSet: true, redeemErr: auth.ErrInvalidPairingCode}, &config.Config{})

	var codes []int
	for i := 0; i < 6; i++ {
		codes = append(codes, do(s, http.MethodPost, "/api/auth/pair", `{"code":"ABCD-2345"}`, remotePeer, nil).Code)
	}
	if codes[4] != http.StatusUnauthorized || codes[5] != http.StatusTooManyRequests {
		t.Errorf("expected 401 x5 then 429, got %v", codes)
	}
}

func TestPair_SharesLimiterWithLogin(t *testing.T) {
	s, _ := startAuthServer(t, &scriptedAuth{MockAuthService: MockAuthService{validToken: "t"}, passwordSet: true, redeemErr: auth.ErrInvalidPairingCode}, &config.Config{})

	for i := 0; i < 5; i++ {
		do(s, http.MethodPost, "/api/auth/login", loginBody, remotePeer, nil)
	}
	if w := do(s, http.MethodPost, "/api/auth/pair", `{"code":"ABCD-2345"}`, remotePeer, nil); w.Code != http.StatusTooManyRequests {
		t.Errorf("pair must share the login limiter, got %d", w.Code)
	}
}

func TestPair_RefusedWhileDefaultPassword(t *testing.T) {
	s, _ := startAuthServer(t, &scriptedAuth{redeemToken: "never"}, &config.Config{})

	w := do(s, http.MethodPost, "/api/auth/pair", `{"code":"ABCD-2345"}`, remotePeer, nil)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", w.Code)
	}
	if !strings.Contains(decodeBody(t, w)["message"].(string), "administrator password") {
		t.Error("503 message must say the administrator password is not set")
	}
}

func TestPair_PersistenceFailureIsGeneric500(t *testing.T) {
	persistFailure := errors.New("persist paired session: write C:\\Users\\someone\\auth.json: disk full")
	s, logs := startAuthServer(t, &scriptedAuth{passwordSet: true, redeemErr: persistFailure}, &config.Config{})

	w := do(s, http.MethodPost, "/api/auth/pair", `{"code":"ABCD-2345","deviceName":"phone"}`, remotePeer, nil)
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", w.Code)
	}
	if strings.Contains(w.Body.String(), "disk full") || strings.Contains(w.Body.String(), "auth.json") {
		t.Errorf("500 body leaked detail: %q", w.Body.String())
	}
	if strings.Contains(logs.joined(), "disk full") {
		t.Errorf("log leaked internal detail: %q", logs.joined())
	}
}

func TestPair_RejectsOtherMethods(t *testing.T) {
	s, _ := startAuthServer(t, &scriptedAuth{passwordSet: true}, &config.Config{})
	if w := do(s, http.MethodGet, "/api/auth/pair", "", remotePeer, nil); w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", w.Code)
	}
}

func TestAuthStatus_ReportsOnlyThreeBooleansWithoutAuth(t *testing.T) {
	cases := []struct {
		name        string
		passwordSet bool
		allowRemote bool
		peer        string
		want        map[string]interface{}
	}{
		{"default password", false, false, remotePeer, map[string]interface{}{"setupRequired": true, "passwordLoginAllowed": false, "pairingAvailable": false}},
		{"remote, flag off", true, false, remotePeer, map[string]interface{}{"setupRequired": false, "passwordLoginAllowed": false, "pairingAvailable": true}},
		{"remote, flag on", true, true, remotePeer, map[string]interface{}{"setupRequired": false, "passwordLoginAllowed": true, "pairingAvailable": true}},
		{"loopback, flag off", true, false, loopbackPeer, map[string]interface{}{"setupRequired": false, "passwordLoginAllowed": true, "pairingAvailable": true}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s, _ := startAuthServer(t, &scriptedAuth{passwordSet: tc.passwordSet}, &config.Config{AllowRemotePasswordLogin: tc.allowRemote})

			w := do(s, http.MethodGet, "/api/auth/status", "", tc.peer, nil)
			if w.Code != http.StatusOK {
				t.Fatalf("expected 200 without credentials, got %d", w.Code)
			}
			got := decodeBody(t, w)
			if len(got) != len(tc.want) {
				t.Fatalf("expected exactly %d keys, got %v", len(tc.want), got)
			}
			for key, want := range tc.want {
				if got[key] != want {
					t.Errorf("%s = %v, want %v", key, got[key], want)
				}
			}
		})
	}
}

func TestAuthStatus_RejectsPost(t *testing.T) {
	s, _ := startAuthServer(t, &scriptedAuth{passwordSet: true}, &config.Config{})
	if w := do(s, http.MethodPost, "/api/auth/status", "{}", remotePeer, nil); w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", w.Code)
	}
}

func TestLoginLogsContainNoControlCharacters(t *testing.T) {
	s, logs := startAuthServer(t, &scriptedAuth{MockAuthService: MockAuthService{validToken: "t"}, passwordSet: true}, &config.Config{})

	body := `{"username":"adm\r\n[12:00:00] forged","password":"nope","deviceName":"ph\u0000one\u001b[31m\nfake"}`
	do(s, http.MethodPost, "/api/auth/login", body, loopbackPeer, nil)

	logged := logs.joined()
	if !strings.Contains(logged, "Login failed") {
		t.Fatalf("expected a login failure log, got %q", logged)
	}
	for _, line := range logs.lines {
		for _, r := range line {
			if unicode.IsControl(r) {
				t.Fatalf("control character %U in log line %q", r, line)
			}
		}
	}
}

func TestStart_LoopbackBindListensOnLoopbackOnly(t *testing.T) {
	mgr := manager.NewManager(nil, nil, &MockConfigService{config: &config.Config{}})
	s := NewServer(context.Background(), mgr, &MockAuthService{validToken: "t"}, mockAssets, "1.0.0", func() {})
	s.SkipEvents = true

	if err := s.Start(config.ResolveBindHost(config.BindLoopback), "0", nil); err != nil {
		t.Fatalf("Start() failed: %v", err)
	}
	t.Cleanup(func() { s.Stop() })

	host, _, err := net.SplitHostPort(s.boundAddr)
	if err != nil || host != "127.0.0.1" {
		t.Fatalf("expected the listener on 127.0.0.1, got %q (%v)", s.boundAddr, err)
	}
}

func TestIsLoopbackRequest(t *testing.T) {
	cases := map[string]bool{
		"127.0.0.1:1":          true,
		"[::1]:1":              true,
		"[::ffff:127.0.0.1]:1": true,
		"192.0.2.10:1":         false,
		"[2001:db8::1]:1":      false,
		"garbage":              false,
		"":                     false,
	}
	for remoteAddr, want := range cases {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = remoteAddr
		if got := isLoopbackRequest(req); got != want {
			t.Errorf("isLoopbackRequest(%q) = %v, want %v", remoteAddr, got, want)
		}
	}
}

type serverTestClock struct {
	mu      sync.Mutex
	current time.Time
}

func (c *serverTestClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.current
}

func (c *serverTestClock) advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.current = c.current.Add(d)
}
