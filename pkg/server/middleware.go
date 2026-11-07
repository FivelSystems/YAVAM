package server

import (
	"net/http"
	"strings"
)

const messageAuthUnavailable = "Authentication is temporarily unavailable"

// AuthMiddleware protects routes requiring authentication and extends the
// session's idle window on each accepted request.
func (s *Server) AuthMiddleware(next http.Handler) http.Handler {
	return s.authenticate(next, s.sessionTokenValidator(true))
}

// NonSlidingAuthMiddleware applies the same rules as AuthMiddleware for routes
// that are bookkeeping around a session (such as event-ticket issuance) and
// must not keep it alive.
func (s *Server) NonSlidingAuthMiddleware(next http.Handler) http.Handler {
	return s.authenticate(next, s.sessionTokenValidator(false))
}

func (s *Server) sessionTokenValidator(slideIdleWindow bool) func(token string) error {
	return func(token string) error {
		var err error
		if slideIdleWindow {
			_, err = s.auth.ValidateToken(token)
		} else {
			_, err = s.auth.CheckToken(token)
		}
		return err
	}
}

// requireAuthService fails the request closed when the auth service did not
// initialise, instead of dereferencing it.
func (s *Server) requireAuthService(w http.ResponseWriter) bool {
	if s.auth != nil {
		return true
	}
	s.writeError(w, messageAuthUnavailable, http.StatusServiceUnavailable)
	return false
}

func (s *Server) authenticate(next http.Handler, validateToken func(token string) error) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !s.requireAuthService(w) {
			return
		}

		// 1. Get Token from Header or Query
		token := ""
		authHeader := r.Header.Get("Authorization")
		if authHeader != "" {
			parts := strings.Split(authHeader, " ")
			if len(parts) == 2 && parts[0] == "Bearer" {
				token = parts[1]
			}
		}

		if token == "" {
			token = r.URL.Query().Get("token")
		}

		// 2. Validate Token
		if token != "" {
			if err := validateToken(token); err == nil {
				// Token Valid -> Admin Access
				next.ServeHTTP(w, r)
				return
			}
			// Strict Mode: If a token is provided but invalid, Fail immediately.
			// Do NOT fallback to Guest. This ensures clients know their session is dead.
			s.writeError(w, "Invalid or Expired Token", http.StatusUnauthorized)
			return
		}

		// 3. Fallback: Check Public Access
		// If PublicAccess is enabled, specific read-only routes are allowed without token.
		cfg := s.manager.GetConfig()
		if cfg.PublicAccess {
			if s.isGuestAllowed(r) {
				next.ServeHTTP(w, r)
				return
			}
		}

		// 4. Deny
		s.writeError(w, "Unauthorized", http.StatusUnauthorized)
	})
}

// isGuestAllowed defines the AllowList for Public/Guest mode
func (s *Server) isGuestAllowed(r *http.Request) bool {
	path := r.URL.Path

	// 1. Safe GET Requests
	if r.Method == "GET" {
		switch path {
		case "/api/packages",
			"/api/disk-space",
			"/api/config",
			"/api/thumbnail":
			// "/api/events": // Secured. Logs should not be public.
			return true
		}
		// /files/ is deliberately absent: it serves whole package files, which
		// guests may browse but never download.
	}

	// 2. Special POST Requests (Read-Only)
	if r.Method == "POST" {
		switch path {
		case "/api/contents": // Read package contents
			return true
		case "/api/scan/collisions": // Check collisions (Read-Only?)
			// Technically read only check, but often precedes write.
			// Let's allow it for "Check" but strictly it's fine.
			return true
		}
	}

	return false
}
