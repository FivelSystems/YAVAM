package server

import (
	"net/http"
	"net/url"
	"strings"
	"testing"
	"unicode"
	"yavam/pkg/services/config"
)

func assertLogLinesArePlain(t *testing.T, logs *logCapture) {
	t.Helper()
	logs.mu.Lock()
	defer logs.mu.Unlock()
	for _, line := range logs.lines {
		for _, r := range line {
			if unicode.IsControl(r) || unicode.Is(unicode.Cf, r) {
				t.Fatalf("control or format character %U in log line %q", r, line)
			}
		}
	}
}

func TestRequestLogLinesCarryNoControlOrFormatCharacters(t *testing.T) {
	s, logs := startAuthServer(t, &MockAuthService{validToken: "valid"}, &config.Config{})
	forgedLine := "\r\n[12:00:00] Server stopped."
	bidiOverride := string(rune(0x202E))

	do(s, http.MethodGet, "/"+url.PathEscape("x"+forgedLine+bidiOverride+"y"), "", loopbackPeer, nil)

	if !strings.Contains(logs.joined(), "[Request]") {
		t.Fatalf("expected a request log line, got %q", logs.joined())
	}
	assertLogLinesArePlain(t, logs)
}

func TestGuestSuppliedPathIsSanitisedBeforeValidation(t *testing.T) {
	s, logs := startAuthServer(t, &MockAuthService{validToken: "valid"}, &config.Config{Libraries: []string{"C:/Allowed"}, PublicAccess: true})
	hostile := "C:/Secrets\r\n[12:00:00] forged" + string(rune(0x200B)) + string(rune(0x202E))

	route := "/api/packages?path=" + url.QueryEscape(hostile)
	for _, headers := range []map[string]string{nil, {"Authorization": "Bearer valid"}} {
		if w := do(s, http.MethodGet, route, "", loopbackPeer, headers); w.Code != http.StatusForbidden {
			t.Fatalf("expected 403, got %d", w.Code)
		}
	}

	if !strings.Contains(logs.joined(), "Access denied") {
		t.Fatalf("expected an access-denied log line, got %q", logs.joined())
	}
	assertLogLinesArePlain(t, logs)
}
