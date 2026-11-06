package auth

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

type fakeClock struct{ current time.Time }

func (c *fakeClock) Now() time.Time          { return c.current }
func (c *fakeClock) Advance(d time.Duration) { c.current = c.current.Add(d) }

func newClockedService(t *testing.T) (*SimpleTokenAuthService, *fakeClock, string) {
	t.Helper()
	clock := &fakeClock{current: time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)}
	path := filepath.Join(t.TempDir(), "auth.json")
	svc, err := NewSimpleAuthServiceWithClock(path, clock.Now)
	if err != nil {
		t.Fatalf("create service: %v", err)
	}
	if err := svc.SetPassword("secret"); err != nil {
		t.Fatalf("set password: %v", err)
	}
	return svc, clock, path
}

func loginToken(t *testing.T, svc *SimpleTokenAuthService, device string) string {
	t.Helper()
	token, err := svc.Login("admin", "secret", device)
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	return token
}

func TestValidTokenAccepted(t *testing.T) {
	svc, _, _ := newClockedService(t)
	token := loginToken(t, svc, "dev")

	if _, err := svc.ValidateToken(token); err != nil {
		t.Fatalf("expected valid token, got %v", err)
	}
}

func TestAbsoluteExpiry(t *testing.T) {
	svc, clock, _ := newClockedService(t)
	token := loginToken(t, svc, "dev")

	for elapsed := time.Duration(0); elapsed < SessionAbsoluteLifetime-SessionIdleTimeout/2; elapsed += SessionIdleTimeout / 2 {
		clock.Advance(SessionIdleTimeout / 2)
		if _, err := svc.ValidateToken(token); err != nil {
			t.Fatalf("active session expired early at %v: %v", elapsed, err)
		}
	}

	clock.current = clock.current.Add(SessionAbsoluteLifetime)
	if _, err := svc.ValidateToken(token); err != ErrInvalidToken {
		t.Fatalf("expected ErrInvalidToken after absolute lifetime, got %v", err)
	}
	if sessions, _ := svc.ListSessions(); len(sessions) != 0 {
		t.Fatalf("expired session should be deleted, got %d sessions", len(sessions))
	}
}

func TestIdleExpiry(t *testing.T) {
	svc, clock, _ := newClockedService(t)
	token := loginToken(t, svc, "dev")

	clock.Advance(SessionIdleTimeout)
	if _, err := svc.ValidateToken(token); err != ErrInvalidToken {
		t.Fatalf("expected ErrInvalidToken after idle timeout, got %v", err)
	}
}

func TestSlidingRefreshExtendsIdleWindow(t *testing.T) {
	svc, clock, _ := newClockedService(t)
	token := loginToken(t, svc, "dev")

	clock.Advance(SessionIdleTimeout - time.Hour)
	if _, err := svc.ValidateToken(token); err != nil {
		t.Fatalf("session should still be valid: %v", err)
	}

	clock.Advance(SessionIdleTimeout - time.Hour)
	if _, err := svc.ValidateToken(token); err != nil {
		t.Fatalf("refresh should have extended idle window: %v", err)
	}
}

func TestRevokedTokenInvalid(t *testing.T) {
	svc, _, _ := newClockedService(t)
	token := loginToken(t, svc, "dev")

	svc.RevokeToken(token)
	if _, err := svc.ValidateToken(token); err != ErrInvalidToken {
		t.Fatalf("expected ErrInvalidToken after revoke, got %v", err)
	}
}

func TestRevokeSessionByID(t *testing.T) {
	svc, _, _ := newClockedService(t)
	token := loginToken(t, svc, "dev")

	sessions, _ := svc.ListSessions()
	if len(sessions) != 1 {
		t.Fatalf("expected 1 session, got %d", len(sessions))
	}
	if err := svc.RevokeSession(sessions[0].ID); err != nil {
		t.Fatalf("revoke session: %v", err)
	}
	if _, err := svc.ValidateToken(token); err != ErrInvalidToken {
		t.Fatalf("expected ErrInvalidToken, got %v", err)
	}
	if err := svc.RevokeSession("missing"); err == nil {
		t.Fatal("expected error for unknown session id")
	}
}

func TestSessionListingOmitsToken(t *testing.T) {
	svc, _, _ := newClockedService(t)
	token := loginToken(t, svc, "dev")

	sessions, _ := svc.ListSessions()
	encoded, err := json.Marshal(sessions)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(encoded), token) || strings.Contains(string(encoded), hashToken(token)) {
		t.Fatal("session listing must not expose token or its hash")
	}
}

func TestTokenStoredOnlyAsHash(t *testing.T) {
	svc, _, path := newClockedService(t)
	token := loginToken(t, svc, "dev")

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), token) {
		t.Fatal("raw token must not appear in auth file")
	}
	if !strings.Contains(string(data), hashToken(token)) {
		t.Fatal("hashed token should appear in auth file")
	}
}

func TestExpiryEnforcedAfterRestart(t *testing.T) {
	svc, clock, path := newClockedService(t)
	token := loginToken(t, svc, "dev")

	clock.Advance(SessionIdleTimeout + time.Minute)
	restarted, err := NewSimpleAuthServiceWithClock(path, clock.Now)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := restarted.ValidateToken(token); err != ErrInvalidToken {
		t.Fatalf("expected expired session to be gone after restart, got %v", err)
	}
}

func TestLegacyFileMigration(t *testing.T) {
	clock := &fakeClock{current: time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)}
	path := filepath.Join(t.TempDir(), "auth.json")
	legacyToken := strings.Repeat("ab", 32)
	legacyFile := `{
  "admin_hash": "placeholder-hash",
  "sessions": {
    "` + legacyToken + `": {
      "id": "legacy-id",
      "username": "admin",
      "role": "admin",
      "deviceName": "old-phone",
      "ipAddress": "",
      "createdAt": "2020-01-01T00:00:00Z"
    }
  }
}`
	if err := os.WriteFile(path, []byte(legacyFile), 0600); err != nil {
		t.Fatal(err)
	}

	svc, err := NewSimpleAuthServiceWithClock(path, clock.Now)
	if err != nil {
		t.Fatalf("load legacy file: %v", err)
	}

	user, err := svc.ValidateToken(legacyToken)
	if err != nil {
		t.Fatalf("legacy token should stay valid after migration: %v", err)
	}
	if user.DeviceName != "old-phone" || user.ID != "legacy-id" {
		t.Fatalf("legacy metadata lost: %+v", user)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), legacyToken) {
		t.Fatal("raw legacy token must not remain in saved file")
	}
	if strings.Contains(string(data), `"sessions"`) {
		t.Fatal("legacy sessions key must not be written back")
	}

	restarted, err := NewSimpleAuthServiceWithClock(path, clock.Now)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := restarted.ValidateToken(legacyToken); err != nil {
		t.Fatalf("migrated token should survive restart: %v", err)
	}

	clock.Advance(SessionAbsoluteLifetime)
	if _, err := restarted.ValidateToken(legacyToken); err != ErrInvalidToken {
		t.Fatalf("migrated session should follow new expiry rules, got %v", err)
	}
}

func TestLastUsedPersistenceIsThrottled(t *testing.T) {
	svc, clock, path := newClockedService(t)
	token := loginToken(t, svc, "dev")
	loginTime := clock.Now()

	persistedLastUsed := func() time.Time {
		config, err := NewFileAuthStore(path).Load()
		if err != nil {
			t.Fatal(err)
		}
		for _, session := range config.Sessions {
			return session.LastUsedAt
		}
		t.Fatal("no persisted session")
		return time.Time{}
	}

	clock.Advance(lastUsedPersistInterval / 4)
	if _, err := svc.ValidateToken(token); err != nil {
		t.Fatal(err)
	}
	if got := persistedLastUsed(); !got.Equal(loginTime) {
		t.Fatalf("last-used should not be persisted within throttle window, got %v", got)
	}

	clock.Advance(lastUsedPersistInterval)
	if _, err := svc.ValidateToken(token); err != nil {
		t.Fatal(err)
	}
	if got := persistedLastUsed(); !got.Equal(clock.Now()) {
		t.Fatalf("last-used should be persisted after throttle window, got %v", got)
	}
}
