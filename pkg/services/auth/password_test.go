package auth

import (
	"errors"
	"path/filepath"
	"strings"
	"testing"
)

const testPassword = "secret-pass"

func TestSeededDefaultPasswordStillLogsIn(t *testing.T) {
	svc, _, _ := newFreshService(t)

	if _, err := svc.Login("admin", defaultAdminPassword, "dev"); err != nil {
		t.Fatalf("seeded default must work before any change: %v", err)
	}
}

func newFreshService(t *testing.T) (*SimpleTokenAuthService, *fakeClock, string) {
	t.Helper()
	clock := &fakeClock{current: testStart}
	path := filepath.Join(t.TempDir(), "auth.json")
	svc, err := NewSimpleAuthServiceWithClock(path, clock.Now)
	if err != nil {
		t.Fatalf("create service: %v", err)
	}
	return svc, clock, path
}

func TestHasCustomPasswordFollowsSetPassword(t *testing.T) {
	svc, clock, path := newFreshService(t)
	if svc.HasCustomPassword() {
		t.Fatal("fresh install must report the default password")
	}

	reloadedDefault, err := NewSimpleAuthServiceWithClock(path, clock.Now)
	if err != nil {
		t.Fatal(err)
	}
	if reloadedDefault.HasCustomPassword() {
		t.Fatal("reloaded default install must still report the default password")
	}

	if err := svc.SetPassword(testPassword); err != nil {
		t.Fatal(err)
	}
	if !svc.HasCustomPassword() {
		t.Fatal("password must count as custom after SetPassword")
	}

	reloaded, err := NewSimpleAuthServiceWithClock(path, clock.Now)
	if err != nil {
		t.Fatal(err)
	}
	if !reloaded.HasCustomPassword() {
		t.Fatal("custom password must survive a reload from the same store")
	}
}

func TestSetPasswordRules(t *testing.T) {
	cases := []struct {
		name     string
		password string
		want     error
	}{
		{"default", "admin", ErrPasswordIsDefault},
		{"empty", "", ErrPasswordTooShort},
		{"one short of minimum", strings.Repeat("a", MinPasswordLength-1), ErrPasswordTooShort},
		{"multibyte one short", strings.Repeat("é", MinPasswordLength-1), ErrPasswordTooShort},
		{"exactly minimum", strings.Repeat("a", MinPasswordLength), nil},
		{"multibyte minimum", strings.Repeat("é", MinPasswordLength), nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			svc, _, _ := newFreshService(t)

			err := svc.SetPassword(tc.password)
			if !errors.Is(err, tc.want) {
				t.Fatalf("SetPassword(%q) = %v, want %v", tc.password, err, tc.want)
			}
			if tc.want != nil && svc.HasCustomPassword() {
				t.Fatal("rejected password must not change the stored hash")
			}
		})
	}
}
