package server

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

const defaultSessionRecheckInterval = 10 * time.Second

type sessionTokenContextKey struct{}

func bearerToken(r *http.Request) string {
	parts := strings.Split(r.Header.Get("Authorization"), " ")
	if len(parts) == 2 && parts[0] == "Bearer" {
		return parts[1]
	}
	return ""
}

func (s *Server) recheckInterval() time.Duration {
	if s.sessionRecheckInterval > 0 {
		return s.sessionRecheckInterval
	}
	return defaultSessionRecheckInterval
}

func (s *Server) sessionIsValid(sessionToken string) bool {
	_, err := s.auth.ValidateToken(sessionToken)
	return err == nil
}

// eventsAuthMiddleware authenticates the event stream with either a Bearer
// header or a one-time ticket. The long-lived token in the query string is
// deliberately not accepted here. The resolved session token is passed to the
// handler through the request context.
func (s *Server) eventsAuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sessionToken := bearerToken(r)
		if sessionToken == "" {
			if ticket := r.URL.Query().Get("ticket"); ticket != "" {
				sessionToken, _ = s.tickets.Consume(ticket)
			}
		}
		if sessionToken == "" || !s.sessionIsValid(sessionToken) {
			s.writeError(w, "Invalid or Expired Token", http.StatusUnauthorized)
			return
		}
		ctx := context.WithValue(r.Context(), sessionTokenContextKey{}, sessionToken)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// handleEventTicket issues a one-time ticket for the caller's own session.
func (s *Server) handleEventTicket(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	sessionToken := bearerToken(r)
	if sessionToken == "" {
		s.writeError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	ticket, err := s.tickets.Issue(sessionToken)
	if err == ErrTicketLimitReached {
		s.writeError(w, "Too many pending tickets", http.StatusTooManyRequests)
		return
	}
	if err != nil {
		s.writeError(w, "Could not issue ticket", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	json.NewEncoder(w).Encode(map[string]string{"ticket": ticket})
}
