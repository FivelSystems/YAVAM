package server

import (
	"mime"
	"net/http"
)

const (
	mediaTypeJSON = "application/json"

	messageJSONRequired = "Content-Type must be application/json"
)

// requireJSONContentType answers 415 to a POST that is not declared as JSON.
// A cross-site form or text/plain request cannot set that header without a
// CORS preflight, which the same-origin policy refuses, so the sign-in routes
// only ever act on requests the bundled client made. Other methods pass
// through so the handler can report 405.
func (s *Server) requireJSONContentType(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
			if err != nil || mediaType != mediaTypeJSON {
				s.writeError(w, messageJSONRequired, http.StatusUnsupportedMediaType)
				return
			}
		}
		next(w, r)
	}
}
