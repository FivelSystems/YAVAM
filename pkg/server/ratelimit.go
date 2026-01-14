package server

import (
	"net"
	"net/http"
	"sync"
	"time"
)

type RateLimiter struct {
	mu     sync.Mutex
	visits map[string][]time.Time
	limit  int
	window time.Duration
}

func NewRateLimiter(limit int, window time.Duration) *RateLimiter {
	rl := &RateLimiter{
		visits: make(map[string][]time.Time),
		limit:  limit,
		window: window,
	}
	// Cleanup routine
	go rl.cleanup()
	return rl
}

func (rl *RateLimiter) Allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	times, exists := rl.visits[ip]

	// Filter out old requests
	var validTimes []time.Time
	if exists {
		for _, t := range times {
			if now.Sub(t) <= rl.window {
				validTimes = append(validTimes, t)
			}
		}
	}

	if len(validTimes) >= rl.limit {
		// Update map with cleaned up times to prevent memory leak if they keep spamming
		rl.visits[ip] = validTimes
		return false
	}

	// Add new request
	validTimes = append(validTimes, now)
	rl.visits[ip] = validTimes
	return true
}

func (rl *RateLimiter) cleanup() {
	for {
		time.Sleep(rl.window)
		rl.mu.Lock()
		now := time.Now()
		for ip, times := range rl.visits {
			var validTimes []time.Time
			for _, t := range times {
				if now.Sub(t) <= rl.window {
					validTimes = append(validTimes, t)
				}
			}
			if len(validTimes) == 0 {
				delete(rl.visits, ip)
			} else {
				rl.visits[ip] = validTimes
			}
		}
		rl.mu.Unlock()
	}
}

// Middleware returns a handler that enforces the rate limit
func (rl *RateLimiter) Middleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Extract IP without port
		ip := r.RemoteAddr
		host, _, err := net.SplitHostPort(r.RemoteAddr)
		if err == nil {
			ip = host
		}

		if !rl.Allow(ip) {
			http.Error(w, "Too many requests", http.StatusTooManyRequests)
			return
		}
		next(w, r)
	}
}
