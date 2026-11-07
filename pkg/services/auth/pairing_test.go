package auth

import (
	"errors"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

const wrongPairingCode = "ZZZZ-ZZZZ"

func newPairingService(t *testing.T) (*SimpleTokenAuthService, *fakeClock) {
	t.Helper()
	svc, clock, _ := newFreshService(t)
	if err := svc.SetPassword(testPassword); err != nil {
		t.Fatal(err)
	}
	return svc, clock
}

func issueCode(t *testing.T, svc *SimpleTokenAuthService) PairingCode {
	t.Helper()
	code, err := svc.CreatePairingCode(DefaultPairingTTL)
	if err != nil {
		t.Fatalf("create pairing code: %v", err)
	}
	return code
}

func TestPairingCodeFormat(t *testing.T) {
	svc, _ := newPairingService(t)

	for i := 0; i < 200; i++ {
		code := issueCode(t, svc).Code
		if len(code) != pairingCodeLength+1 || code[pairingCodeGroupLength] != '-' {
			t.Fatalf("unexpected code layout %q", code)
		}
		for _, symbol := range strings.ReplaceAll(code, "-", "") {
			if !strings.ContainsRune(pairingAlphabet, symbol) {
				t.Fatalf("symbol %q outside the alphabet in %q", symbol, code)
			}
		}
	}
}

func TestPairingAlphabetIsUnambiguousAndUnbiased(t *testing.T) {
	if 256%len(pairingAlphabet) != 0 {
		t.Fatal("alphabet length must divide 256 for unbiased selection")
	}
	if strings.ContainsAny(pairingAlphabet, "0O1I") {
		t.Fatal("alphabet must not contain ambiguous symbols")
	}
}

func TestRedeemedCodeYieldsUsableSession(t *testing.T) {
	svc, _ := newPairingService(t)
	code := issueCode(t, svc)

	token, err := svc.RedeemPairingCode(code.Code, "Living room tablet")
	if err != nil {
		t.Fatal(err)
	}
	user, err := svc.ValidateToken(token)
	if err != nil {
		t.Fatalf("ValidateToken: %v", err)
	}
	if user.DeviceName != "Living room tablet" || user.Role != "admin" {
		t.Fatalf("unexpected session %+v", user)
	}
	if _, err := svc.CheckToken(token); err != nil {
		t.Fatalf("CheckToken: %v", err)
	}
	if svc.PairingStatus().Active {
		t.Fatal("code must be consumed after redemption")
	}
}

func TestRedeemedSessionSurvivesReload(t *testing.T) {
	svc, clock, path := newFreshService(t)
	if err := svc.SetPassword(testPassword); err != nil {
		t.Fatal(err)
	}
	token, err := svc.RedeemPairingCode(issueCode(t, svc).Code, "phone")
	if err != nil {
		t.Fatal(err)
	}

	reloaded, err := NewSimpleAuthServiceWithClock(path, clock.Now)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := reloaded.ValidateToken(token); err != nil {
		t.Fatalf("paired session lost after reload: %v", err)
	}
}

func TestCodeIsSingleUse(t *testing.T) {
	svc, _ := newPairingService(t)
	code := issueCode(t, svc)

	if _, err := svc.RedeemPairingCode(code.Code, "first"); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.RedeemPairingCode(code.Code, "second"); !errors.Is(err, ErrInvalidPairingCode) {
		t.Fatalf("second redemption: got %v, want ErrInvalidPairingCode", err)
	}
}

func TestExpiredCodeIsRejected(t *testing.T) {
	svc, clock := newPairingService(t)
	code := issueCode(t, svc)

	clock.Advance(DefaultPairingTTL)

	if svc.PairingStatus().Active {
		t.Fatal("expired code must not report as active")
	}
	if _, err := svc.RedeemPairingCode(code.Code, "late"); !errors.Is(err, ErrInvalidPairingCode) {
		t.Fatalf("expired redemption: got %v, want ErrInvalidPairingCode", err)
	}
}

func TestCodeStillValidJustBeforeExpiry(t *testing.T) {
	svc, clock := newPairingService(t)
	code := issueCode(t, svc)

	clock.Advance(DefaultPairingTTL - time.Second)

	if _, err := svc.RedeemPairingCode(code.Code, "punctual"); err != nil {
		t.Fatalf("code within its TTL must redeem: %v", err)
	}
}

func TestNoOutstandingCodeIsInvalid(t *testing.T) {
	svc, _ := newPairingService(t)

	if _, err := svc.RedeemPairingCode("ABCD-EFGH", "dev"); !errors.Is(err, ErrInvalidPairingCode) {
		t.Fatalf("got %v, want ErrInvalidPairingCode", err)
	}
}

func TestRegeneratingInvalidatesPreviousCode(t *testing.T) {
	svc, _ := newPairingService(t)
	first := issueCode(t, svc)
	second := issueCode(t, svc)

	if _, err := svc.RedeemPairingCode(first.Code, "dev"); !errors.Is(err, ErrInvalidPairingCode) {
		t.Fatalf("previous code: got %v, want ErrInvalidPairingCode", err)
	}
	if _, err := svc.RedeemPairingCode(second.Code, "dev"); err != nil {
		t.Fatalf("latest code must still redeem: %v", err)
	}
}

func TestFailuresDestroyTheCode(t *testing.T) {
	svc, _ := newPairingService(t)
	code := issueCode(t, svc)

	for i := 0; i < MaxPairingFailures; i++ {
		if _, err := svc.RedeemPairingCode(wrongPairingCode, "attacker"); !errors.Is(err, ErrInvalidPairingCode) {
			t.Fatalf("attempt %d: got %v", i, err)
		}
	}

	if svc.PairingStatus().Active {
		t.Fatal("code must be destroyed after the failure limit")
	}
	if _, err := svc.RedeemPairingCode(code.Code, "owner"); !errors.Is(err, ErrInvalidPairingCode) {
		t.Fatalf("correct code after lockout: got %v, want ErrInvalidPairingCode", err)
	}
}

func TestFailureLimitIsTen(t *testing.T) {
	if MaxPairingFailures != 10 {
		t.Fatalf("MaxPairingFailures = %d, want 10", MaxPairingFailures)
	}
}

func TestCodeSurvivesFewerFailuresThanTheLimit(t *testing.T) {
	svc, _ := newPairingService(t)
	code := issueCode(t, svc)

	for i := 0; i < MaxPairingFailures-1; i++ {
		svc.RedeemPairingCode(wrongPairingCode, "attacker")
	}

	if _, err := svc.RedeemPairingCode(code.Code, "owner"); err != nil {
		t.Fatalf("code must survive %d failures: %v", MaxPairingFailures-1, err)
	}
}

func TestFailuresDoNotCarryOverToANewCode(t *testing.T) {
	svc, _ := newPairingService(t)
	issueCode(t, svc)
	for i := 0; i < MaxPairingFailures-1; i++ {
		svc.RedeemPairingCode(wrongPairingCode, "attacker")
	}

	fresh := issueCode(t, svc)

	if _, err := svc.RedeemPairingCode(wrongPairingCode, "attacker"); !errors.Is(err, ErrInvalidPairingCode) {
		t.Fatal(err)
	}
	if _, err := svc.RedeemPairingCode(fresh.Code, "owner"); err != nil {
		t.Fatalf("new code must start with a clean failure count: %v", err)
	}
}

func TestRedemptionNormalisesInput(t *testing.T) {
	cases := map[string]func(string) string{
		"lowercase":          strings.ToLower,
		"without hyphen":     func(c string) string { return strings.ReplaceAll(c, "-", "") },
		"surrounding spaces": func(c string) string { return "  " + c + " \t\n" },
		"inner spaces":       func(c string) string { return strings.ReplaceAll(c, "-", " ") },
	}
	for name, mangle := range cases {
		t.Run(name, func(t *testing.T) {
			svc, _ := newPairingService(t)
			code := issueCode(t, svc)

			if _, err := svc.RedeemPairingCode(mangle(code.Code), "dev"); err != nil {
				t.Fatalf("%q should redeem: %v", mangle(code.Code), err)
			}
		})
	}
}

func TestConcurrentRedemptionsYieldOneSession(t *testing.T) {
	const attempts = 100
	svc, _ := newPairingService(t)
	code := issueCode(t, svc)

	var successes atomic.Int32
	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := 0; i < attempts; i++ {
		wg.Add(1)
		go func(device string) {
			defer wg.Done()
			<-start
			if _, err := svc.RedeemPairingCode(code.Code, device); err == nil {
				successes.Add(1)
			}
		}(fmt.Sprintf("device-%d", i))
	}
	close(start)
	wg.Wait()

	if got := successes.Load(); got != 1 {
		t.Fatalf("expected exactly one successful redemption, got %d", got)
	}
	if sessions, _ := svc.ListSessions(); len(sessions) != 1 {
		t.Fatalf("expected exactly one session, got %d", len(sessions))
	}
}

func TestPersistFailureLeavesNoSession(t *testing.T) {
	store := newStoreWithAdmin(t)
	svc, _ := newServiceOnStore(t, store)
	code := issueCode(t, svc)
	store.failSaves = true

	_, err := svc.RedeemPairingCode(code.Code, "phone")

	if err == nil || errors.Is(err, ErrInvalidPairingCode) {
		t.Fatalf("expected a persistence error, got %v", err)
	}
	if sessions, _ := svc.ListSessions(); len(sessions) != 0 {
		t.Fatalf("no session may remain after a failed persist, got %d", len(sessions))
	}

	store.failSaves = false
	if _, err := svc.RedeemPairingCode(code.Code, "phone"); !errors.Is(err, ErrInvalidPairingCode) {
		t.Fatalf("consumed code must stay unusable: got %v", err)
	}
}

func TestPersistFailureKeepsReplacedSessionOfSameDevice(t *testing.T) {
	store := newStoreWithAdmin(t)
	svc, _ := newServiceOnStore(t, store)
	existing, err := svc.Login("admin", failureTestPassword, "phone")
	if err != nil {
		t.Fatal(err)
	}
	code := issueCode(t, svc)
	store.failSaves = true

	if _, err := svc.RedeemPairingCode(code.Code, "phone"); err == nil {
		t.Fatal("expected a persistence error")
	}

	if _, err := svc.ValidateToken(existing); err != nil {
		t.Fatalf("previous session of the device must survive a failed pairing: %v", err)
	}
}

func TestPairingRefusedWhileDefaultPassword(t *testing.T) {
	svc, _, _ := newFreshService(t)

	if _, err := svc.CreatePairingCode(DefaultPairingTTL); !errors.Is(err, ErrAdminPasswordNotSet) {
		t.Fatalf("got %v, want ErrAdminPasswordNotSet", err)
	}
	if svc.PairingStatus().Active {
		t.Fatal("no code may exist while the default password is active")
	}
}

func TestPasswordChangeDestroysOutstandingCode(t *testing.T) {
	svc, _ := newPairingService(t)
	code := issueCode(t, svc)

	if err := svc.SetPassword("another-password"); err != nil {
		t.Fatal(err)
	}

	if _, err := svc.RedeemPairingCode(code.Code, "dev"); !errors.Is(err, ErrInvalidPairingCode) {
		t.Fatalf("got %v, want ErrInvalidPairingCode", err)
	}
}

func TestPairingStatusHidesTheCode(t *testing.T) {
	svc, clock := newPairingService(t)
	if svc.PairingStatus().Active {
		t.Fatal("no code issued yet")
	}

	code := issueCode(t, svc)

	status := svc.PairingStatus()
	if !status.Active || !status.ExpiresAt.Equal(code.ExpiresAt) {
		t.Fatalf("unexpected status %+v", status)
	}
	if !code.ExpiresAt.Equal(clock.Now().Add(DefaultPairingTTL)) {
		t.Fatalf("unexpected expiry %v", code.ExpiresAt)
	}
}

func TestPairedDeviceNameIsSanitised(t *testing.T) {
	longName := strings.Repeat("x", maxDeviceNameLength+30)
	cases := []struct {
		name  string
		input string
		want  string
	}{
		{"trimmed", "  Tablet  ", "Tablet"},
		{"control characters stripped", "Pa\x00ir\x1b[31med\r\n", "Pair[31med"},
		{"capped", longName, strings.Repeat("x", maxDeviceNameLength)},
		{"empty falls back", " \t ", pairedDeviceName},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			svc, _ := newPairingService(t)
			token, err := svc.RedeemPairingCode(issueCode(t, svc).Code, tc.input)
			if err != nil {
				t.Fatal(err)
			}
			user, err := svc.CheckToken(token)
			if err != nil {
				t.Fatal(err)
			}
			if user.DeviceName != tc.want {
				t.Fatalf("device name %q, want %q", user.DeviceName, tc.want)
			}
		})
	}
}
