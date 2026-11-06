package server

import (
	"encoding/json"
	"errors"
	"net/http"
)

const maxJSONBodyBytes = 1 << 20

// decodeJSONBody decodes a size-limited JSON request body into destination.
// On failure it writes the error response (413 when oversized, 400 otherwise)
// and returns false.
func (s *Server) decodeJSONBody(w http.ResponseWriter, r *http.Request, destination interface{}) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxJSONBodyBytes)
	err := json.NewDecoder(r.Body).Decode(destination)
	if err == nil {
		return true
	}

	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		s.writeError(w, "Request body too large", http.StatusRequestEntityTooLarge)
		return false
	}
	s.writeError(w, "Invalid request body", http.StatusBadRequest)
	return false
}
