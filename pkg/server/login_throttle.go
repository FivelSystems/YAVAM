package server

import (
	"math"
	"net/http"
	"strconv"
	"sync"
	"time"
)

const (
	loginThrottleBaseDelay = time.Second
	loginThrottleMaxDelay  = 5 * time.Minute

	messageLoginThrottled = "Too many failed sign-in attempts. Try again later"
)

// LoginThrottle slows password guessing across every source address. Each
// admitted attempt is charged as a failure up front and refunded by Succeeded,
// so concurrent attempts cannot all slip past a check that only counts failures
// after the slow password comparison finishes. Once charged, the next attempt
// is refused for an exponentially growing window, capped at maxDelay.
type LoginThrottle struct {
	mu          sync.Mutex
	now         func() time.Time
	baseDelay   time.Duration
	maxDelay    time.Duration
	failures    int
	lockedUntil time.Time
}

func NewLoginThrottle(now func() time.Time, baseDelay, maxDelay time.Duration) *LoginThrottle {
	return &LoginThrottle{now: now, baseDelay: baseDelay, maxDelay: maxDelay}
}

// Admit reports whether an attempt may proceed. When it may not, retryAfter is
// how long the caller must wait.
func (t *LoginThrottle) Admit() (admitted bool, retryAfter time.Duration) {
	t.mu.Lock()
	defer t.mu.Unlock()

	now := t.now()
	if now.Before(t.lockedUntil) {
		return false, t.lockedUntil.Sub(now)
	}
	if now.After(t.lockedUntil.Add(t.maxDelay)) {
		t.failures = 0
	}

	t.failures++
	t.lockedUntil = now.Add(t.delayFor(t.failures))
	return true, 0
}

// Succeeded clears the throttle after a correct password.
func (t *LoginThrottle) Succeeded() {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.failures = 0
	t.lockedUntil = time.Time{}
}

func (t *LoginThrottle) delayFor(failures int) time.Duration {
	exponent := float64(failures - 1)
	if exponent >= 63 || float64(t.baseDelay)*math.Pow(2, exponent) >= float64(t.maxDelay) {
		return t.maxDelay
	}
	return t.baseDelay << uint(failures-1)
}

// throttleFor keeps loopback on its own counter: a remote client must never be
// able to lock the person sitting at the host out of the web client, and a
// local process still cannot guess without being slowed.
func (s *Server) throttleFor(r *http.Request) *LoginThrottle {
	if isLoopbackRequest(r) {
		return s.loopbackLoginThrottle
	}
	return s.remoteLoginThrottle
}

func (s *Server) writeThrottled(w http.ResponseWriter, retryAfter time.Duration) {
	seconds := int(math.Ceil(retryAfter.Seconds()))
	w.Header().Set("Retry-After", strconv.Itoa(seconds))
	s.writeError(w, messageLoginThrottled, http.StatusTooManyRequests)
}
