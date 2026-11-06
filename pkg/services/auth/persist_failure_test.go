package auth

import (
	"bytes"
	"errors"
	"log"
	"os"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"
)

const failureTestPassword = "secret"

type failingStore struct {
	config    *AuthConfig
	failSaves bool
	saveCalls int
}

func (f *failingStore) Load() (*AuthConfig, error) { return f.config, nil }

func (f *failingStore) Save(config *AuthConfig) error {
	f.saveCalls++
	if f.failSaves {
		return errors.New("disk unavailable")
	}
	f.config = config
	return nil
}

func newStoreWithAdmin(t *testing.T) *failingStore {
	t.Helper()
	hash, err := bcrypt.GenerateFromPassword([]byte(failureTestPassword), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	return &failingStore{config: &AuthConfig{AdminHash: string(hash)}}
}

func newServiceOnStore(t *testing.T, store authStore) (*SimpleTokenAuthService, *fakeClock) {
	t.Helper()
	clock := &fakeClock{current: time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)}
	svc, err := newSimpleAuthServiceWithStore(store, clock.Now)
	if err != nil {
		t.Fatalf("create service: %v", err)
	}
	return svc, clock
}

func captureLog(t *testing.T) *bytes.Buffer {
	t.Helper()
	var buffer bytes.Buffer
	log.SetOutput(&buffer)
	t.Cleanup(func() { log.SetOutput(os.Stderr) })
	return &buffer
}

func TestFailingDiskIsRetriedOncePerInterval(t *testing.T) {
	store := newStoreWithAdmin(t)
	svc, clock := newServiceOnStore(t, store)
	token, err := svc.Login("admin", failureTestPassword, "dev")
	if err != nil {
		t.Fatal(err)
	}
	store.failSaves = true
	logs := captureLog(t)
	callsBefore := store.saveCalls

	clock.Advance(persistRetryInterval)
	for i := 0; i < 10; i++ {
		if _, err := svc.ValidateToken(token); err != nil {
			t.Fatal(err)
		}
	}
	if attempts := store.saveCalls - callsBefore; attempts != 1 {
		t.Fatalf("expected one persist attempt within the interval, got %d", attempts)
	}

	clock.Advance(persistRetryInterval)
	if _, err := svc.ValidateToken(token); err != nil {
		t.Fatal(err)
	}
	if attempts := store.saveCalls - callsBefore; attempts != 2 {
		t.Fatalf("expected a retry after the interval, got %d attempts", attempts)
	}
	if lines := strings.Count(logs.String(), "Failed to persist sessions"); lines != 2 {
		t.Fatalf("expected one log line per failed attempt, got %d", lines)
	}
}

func TestFailureLogsAreRateLimited(t *testing.T) {
	store := newStoreWithAdmin(t)
	svc, _ := newServiceOnStore(t, store)
	store.failSaves = true
	logs := captureLog(t)

	for i := 0; i < 5; i++ {
		svc.RevokeToken("unknown")
	}
	if lines := strings.Count(logs.String(), "Failed to persist sessions"); lines != 1 {
		t.Fatalf("expected one log line within the interval, got %d", lines)
	}
}

func TestLegacyEntryNeverOverwritesHashedRecord(t *testing.T) {
	store := newStoreWithAdmin(t)
	const token = "shared-token"
	store.config.Sessions = map[string]*StoredSession{
		hashToken(token): {
			ID: "hashed-id", Username: "admin", Role: "admin", DeviceName: "hashed-device",
			CreatedAt:  time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC),
			LastUsedAt: time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC),
		},
	}
	store.config.LegacySessions = map[string]*User{
		token: {ID: "legacy-id", Username: "admin", Role: "admin", DeviceName: "legacy-device"},
	}

	svc, _ := newServiceOnStore(t, store)

	user, err := svc.ValidateToken(token)
	if err != nil {
		t.Fatal(err)
	}
	if user.ID != "hashed-id" || user.DeviceName != "hashed-device" {
		t.Fatalf("hashed record was overwritten by legacy entry: %+v", user)
	}
}

func TestLegacySessionsDroppedWhenMigrationCannotBePersisted(t *testing.T) {
	store := newStoreWithAdmin(t)
	store.failSaves = true
	const hashedToken, legacyToken = "hashed-token", "legacy-token"
	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	store.config.Sessions = map[string]*StoredSession{
		hashToken(hashedToken): {ID: "hashed-id", Username: "admin", Role: "admin", CreatedAt: now, LastUsedAt: now},
	}
	store.config.LegacySessions = map[string]*User{
		legacyToken: {ID: "legacy-id", Username: "admin", Role: "admin", DeviceName: "old-phone"},
	}
	captureLog(t)

	svc, _ := newServiceOnStore(t, store)

	if _, err := svc.ValidateToken(legacyToken); err != ErrInvalidToken {
		t.Fatalf("legacy session must be dropped when migration cannot be persisted, got %v", err)
	}
	if _, err := svc.ValidateToken(hashedToken); err != nil {
		t.Fatalf("already-hashed session should be kept: %v", err)
	}
}

func TestSetPasswordRollsBackWhenPersistFails(t *testing.T) {
	store := newStoreWithAdmin(t)
	svc, _ := newServiceOnStore(t, store)
	store.failSaves = true

	if err := svc.SetPassword("new-password"); err == nil {
		t.Fatal("expected SetPassword to return the persist error")
	}

	store.failSaves = false
	if _, err := svc.Login("admin", failureTestPassword, "dev"); err != nil {
		t.Fatalf("old password should still work after failed change: %v", err)
	}
	if _, err := svc.Login("admin", "new-password", "dev2"); err == nil {
		t.Fatal("new password must not be active after failed change")
	}
}
