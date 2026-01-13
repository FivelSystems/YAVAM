package server

import (
	"net/http"
	"strings"
)

// AuthMiddleware protects routes requiring authentication
func (s *Server) AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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

		if token == "" {
			s.writeError(w, "Missing Authorization Header or Token", http.StatusUnauthorized)
			return
		}

		// 2. Validate Token
		_, err := s.auth.ValidateToken(token)
		if err != nil {
			s.writeError(w, "Invalid or Expired Token", http.StatusUnauthorized)
			return
		}

		// 3. User is authenticated, proceed
		next.ServeHTTP(w, r)
	})
}
