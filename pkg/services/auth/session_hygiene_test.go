package auth

import (
	"strings"
	"testing"
	"time"
)

// fillSessions creates count sessions one minute apart and returns their
// tokens oldest first.
func fillSessions(t *testing.T, svc *SimpleTokenAuthService, clock *fakeClock, count int) []string {
	t.Helper()
	tokens := make([]string, 0, count)
	for i := 0; i < count; i++ {
		token, err := svc.GenerateToken()
		if err != nil {
			t.Fatalf("generate token: %v", err)
		}
		tokens = append(tokens, token)
		clock.Advance(time.Minute)
	}
	return tokens
}

func assertSessionValidity(t *testing.T, svc *SimpleTokenAuthService, token string, wantValid bool, label string) {
	t.Helper()
	_, err := svc.CheckToken(token)
	if (err == nil) != wantValid {
		t.Fatalf("%s: valid = %v, want %v", label, err == nil, wantValid)
	}
}

func TestSessionCountIsCapped(t *testing.T) {
	svc, clock, _ := newClockedService(t)
	fillSessions(t, svc, clock, maxSessions+5)

	sessions, err := svc.ListSessions()
	if err != nil {
		t.Fatal(err)
	}
	if len(sessions) != maxSessions {
		t.Fatalf("sessions = %d, want %d", len(sessions), maxSessions)
	}
}

func TestOverflowEvictsLeastRecentlyUsedSession(t *testing.T) {
	svc, clock, _ := newClockedService(t)
	tokens := fillSessions(t, svc, clock, maxSessions)

	// The oldest session is used again, so the second oldest becomes the LRU.
	if _, err := svc.ValidateToken(tokens[0]); err != nil {
		t.Fatal(err)
	}
	clock.Advance(time.Minute)

	newToken := loginToken(t, svc, "new device")

	assertSessionValidity(t, svc, tokens[0], true, "recently used session")
	assertSessionValidity(t, svc, tokens[1], false, "least recently used session")
	assertSessionValidity(t, svc, tokens[2], true, "next oldest session")
	assertSessionValidity(t, svc, newToken, true, "new session")
}

func TestSessionsEvictedInOrderOfLastUse(t *testing.T) {
	svc, clock, _ := newClockedService(t)
	tokens := fillSessions(t, svc, clock, maxSessions)

	for i := 0; i < 3; i++ {
		if _, err := svc.GenerateToken(); err != nil {
			t.Fatal(err)
		}
		clock.Advance(time.Minute)
	}

	for i, token := range tokens[:3] {
		assertSessionValidity(t, svc, token, false, "evicted session "+string(rune('0'+i)))
	}
	assertSessionValidity(t, svc, tokens[3], true, "first survivor")
}

func TestLoginSanitisesDeviceName(t *testing.T) {
	longName := strings.Repeat("x", maxDeviceNameLength+30)
	cases := []struct {
		name  string
		input string
		want  string
	}{
		{"trimmed", "  Phone  ", "Phone"},
		{"control characters stripped", "Pho\x00ne\x1b[31m\r\n", "Phone[31m"},
		{"capped", longName, strings.Repeat("x", maxDeviceNameLength)},
		{"empty falls back", " \t ", defaultDeviceName},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			svc, _, _ := newClockedService(t)
			user, err := svc.CheckToken(loginToken(t, svc, tc.input))
			if err != nil {
				t.Fatal(err)
			}
			if user.DeviceName != tc.want {
				t.Fatalf("device name %q, want %q", user.DeviceName, tc.want)
			}
		})
	}
}

func TestGeneratedTokenUsesLocalSystemDeviceName(t *testing.T) {
	svc, _, _ := newClockedService(t)
	token, err := svc.GenerateToken()
	if err != nil {
		t.Fatal(err)
	}
	user, err := svc.CheckToken(token)
	if err != nil {
		t.Fatal(err)
	}
	if user.DeviceName != localSystemDevice {
		t.Fatalf("device name %q, want %q", user.DeviceName, localSystemDevice)
	}
}
