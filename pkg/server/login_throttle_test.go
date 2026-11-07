package server

import (
	"fmt"
	"net/http"
	"sync"
	"sync/atomic"
	"testing"
	"time"
	"yavam/pkg/services/auth"
	"yavam/pkg/services/config"
)

func newTestThrottle() (*LoginThrottle, *serverTestClock) {
	clock := &serverTestClock{current: time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)}
	return NewLoginThrottle(clock.Now, time.Second, 5*time.Minute), clock
}

func TestLoginThrottle_DelayDoublesAfterEachAttempt(t *testing.T) {
	throttle, clock := newTestThrottle()

	for attempt, wantDelay := range []time.Duration{time.Second, 2 * time.Second, 4 * time.Second, 8 * time.Second} {
		if admitted, _ := throttle.Admit(); !admitted {
			t.Fatalf("attempt %d must be admitted once the previous window passed", attempt+1)
		}
		admitted, retryAfter := throttle.Admit()
		if admitted || retryAfter != wantDelay {
			t.Fatalf("attempt %d: admitted=%v retryAfter=%v, want refused for %v", attempt+1, admitted, retryAfter, wantDelay)
		}
		clock.advance(wantDelay)
	}
}

func TestLoginThrottle_DelayIsCapped(t *testing.T) {
	throttle, clock := newTestThrottle()

	var retryAfter time.Duration
	for attempt := 0; attempt < 80; attempt++ {
		throttle.Admit()
		_, retryAfter = throttle.Admit()
		clock.advance(retryAfter)
	}
	if retryAfter != 5*time.Minute {
		t.Fatalf("delay must plateau at the maximum, got %v", retryAfter)
	}
}

func TestLoginThrottle_SuccessResets(t *testing.T) {
	throttle, clock := newTestThrottle()
	for i := 0; i < 4; i++ {
		throttle.Admit()
		clock.advance(time.Minute)
	}

	throttle.Admit()
	throttle.Succeeded()

	if admitted, _ := throttle.Admit(); !admitted {
		t.Fatal("a success must clear the lock window")
	}
	if _, retryAfter := throttle.Admit(); retryAfter != time.Second {
		t.Fatalf("a success must restart growth at the base delay, got %v", retryAfter)
	}
}

func TestLoginThrottle_ForgetsAfterQuietPeriod(t *testing.T) {
	throttle, clock := newTestThrottle()
	for i := 0; i < 6; i++ {
		throttle.Admit()
		_, retryAfter := throttle.Admit()
		clock.advance(retryAfter)
	}

	clock.advance(5*time.Minute + time.Second)

	throttle.Admit()
	if _, retryAfter := throttle.Admit(); retryAfter != time.Second {
		t.Fatalf("a quiet period must clear old failures, got %v", retryAfter)
	}
}

func TestLoginThrottle_ConcurrentAttemptsAdmitExactlyOne(t *testing.T) {
	throttle, _ := newTestThrottle()

	const contenders = 64
	var admittedCount atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < contenders; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if admitted, _ := throttle.Admit(); admitted {
				admittedCount.Add(1)
			}
		}()
	}
	wg.Wait()

	if admittedCount.Load() != 1 {
		t.Fatalf("a burst must be charged up front: %d admitted, want 1", admittedCount.Load())
	}
}

type loginSpyAuth struct {
	MockAuthService
	loginCalls atomic.Int32
	succeed    atomic.Bool
}

func (a *loginSpyAuth) HasCustomPassword() bool { return true }

func (a *loginSpyAuth) Login(username, password, deviceName string) (string, error) {
	a.loginCalls.Add(1)
	if a.succeed.Load() {
		return "session-token", nil
	}
	return "", auth.ErrInvalidToken
}

func startThrottledServer(t *testing.T, allowRemote bool) (*Server, *loginSpyAuth, *serverTestClock) {
	t.Helper()
	spy := &loginSpyAuth{}
	s, _ := startAuthServer(t, spy, &config.Config{AllowRemotePasswordLogin: allowRemote})
	clock := &serverTestClock{current: time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)}
	s.remoteLoginThrottle = NewLoginThrottle(clock.Now, loginThrottleBaseDelay, loginThrottleMaxDelay)
	s.loopbackLoginThrottle = NewLoginThrottle(clock.Now, loginThrottleBaseDelay, loginThrottleMaxDelay)
	return s, spy, clock
}

// each attempt uses its own source address so the per-IP limiter stays out of the way.
func remotePeerNumber(n int) string   { return fmt.Sprintf("192.0.2.%d:40000", n) }
func loopbackPeerNumber(n int) string { return fmt.Sprintf("127.0.0.%d:40000", n) }

func TestLoginThrottle_RefusesBeforeVerifyingThePassword(t *testing.T) {
	s, spy, clock := startThrottledServer(t, true)

	if w := do(s, http.MethodPost, "/api/auth/login", loginBody, remotePeerNumber(1), nil); w.Code != http.StatusUnauthorized {
		t.Fatalf("first failure: expected 401, got %d", w.Code)
	}
	w := do(s, http.MethodPost, "/api/auth/login", loginBody, remotePeerNumber(2), nil)
	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("second attempt from another address must be throttled, got %d", w.Code)
	}
	if w.Header().Get("Retry-After") != "1" {
		t.Errorf("Retry-After = %q, want 1", w.Header().Get("Retry-After"))
	}
	if spy.loginCalls.Load() != 1 {
		t.Fatalf("a throttled request must not reach the password check: %d Login calls", spy.loginCalls.Load())
	}

	clock.advance(time.Second)
	if w := do(s, http.MethodPost, "/api/auth/login", loginBody, remotePeerNumber(3), nil); w.Code != http.StatusUnauthorized {
		t.Fatalf("after the window the attempt reaches the check again, got %d", w.Code)
	}
	if spy.loginCalls.Load() != 2 {
		t.Fatalf("expected 2 Login calls, got %d", spy.loginCalls.Load())
	}
}

func TestLoginThrottle_SuccessClearsTheLock(t *testing.T) {
	s, spy, clock := startThrottledServer(t, true)

	do(s, http.MethodPost, "/api/auth/login", loginBody, remotePeerNumber(1), nil)
	clock.advance(time.Second)
	spy.succeed.Store(true)
	if w := do(s, http.MethodPost, "/api/auth/login", loginBody, remotePeerNumber(2), nil); w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	spy.succeed.Store(false)

	do(s, http.MethodPost, "/api/auth/login", loginBody, remotePeerNumber(3), nil)
	w := do(s, http.MethodPost, "/api/auth/login", loginBody, remotePeerNumber(4), nil)
	if w.Code != http.StatusTooManyRequests || w.Header().Get("Retry-After") != "1" {
		t.Fatalf("growth must restart at the base delay after a success: %d, Retry-After %q", w.Code, w.Header().Get("Retry-After"))
	}
}

func TestLoginThrottle_RemoteFailuresDoNotLockLoopback(t *testing.T) {
	s, spy, _ := startThrottledServer(t, true)

	do(s, http.MethodPost, "/api/auth/login", loginBody, remotePeerNumber(1), nil)
	if w := do(s, http.MethodPost, "/api/auth/login", loginBody, remotePeerNumber(2), nil); w.Code != http.StatusTooManyRequests {
		t.Fatalf("remote must be locked, got %d", w.Code)
	}

	spy.succeed.Store(true)
	if w := do(s, http.MethodPost, "/api/auth/login", loginBody, loopbackPeerNumber(1), nil); w.Code != http.StatusOK {
		t.Fatalf("remote attempts must not lock loopback out, got %d", w.Code)
	}
}

func TestLoginThrottle_LoopbackIsThrottledOnItsOwnCounter(t *testing.T) {
	s, _, _ := startThrottledServer(t, false)

	do(s, http.MethodPost, "/api/auth/login", loginBody, loopbackPeerNumber(1), nil)
	if w := do(s, http.MethodPost, "/api/auth/login", loginBody, loopbackPeerNumber(2), nil); w.Code != http.StatusTooManyRequests {
		t.Fatalf("loopback guessing must still be slowed, got %d", w.Code)
	}
}

func TestLoginThrottle_RefusedRemoteRequestsDoNotChargeTheThrottle(t *testing.T) {
	s, spy, _ := startThrottledServer(t, false)

	for i := 1; i <= 4; i++ {
		if w := do(s, http.MethodPost, "/api/auth/login", loginBody, remotePeerNumber(i), nil); w.Code != http.StatusForbidden {
			t.Fatalf("remote login with the flag off must be 403, got %d", w.Code)
		}
	}
	if spy.loginCalls.Load() != 0 {
		t.Fatalf("refused requests must not reach the password check: %d calls", spy.loginCalls.Load())
	}
	if admitted, _ := s.remoteLoginThrottle.Admit(); !admitted {
		t.Fatal("requests refused by the remote gate must not move the throttle")
	}
}

func TestLoginThrottle_PairingIsUnaffected(t *testing.T) {
	s, _, _ := startThrottledServer(t, true)

	do(s, http.MethodPost, "/api/auth/login", loginBody, remotePeerNumber(1), nil)
	if w := do(s, http.MethodPost, "/api/auth/login", loginBody, remotePeerNumber(2), nil); w.Code != http.StatusTooManyRequests {
		t.Fatalf("login must be locked, got %d", w.Code)
	}

	w := do(s, http.MethodPost, "/api/auth/pair", `{"code":"ABCD-2345","deviceName":"phone"}`, remotePeerNumber(3), nil)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("pairing must be judged on its own: expected 401 for a wrong code, got %d", w.Code)
	}
}
