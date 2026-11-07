package server

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"time"
)

const (
	maxJSONBodyBytes = 1 << 20

	// defaultJSONBodyReadTimeout bounds how long a client may take to deliver a
	// JSON body. Bodies are capped at maxJSONBodyBytes, so a legitimate client
	// finishes in moments; uploads, streams and downloads never pass through
	// decodeJSONBody and keep having no overall deadline.
	defaultJSONBodyReadTimeout = 10 * time.Second
)

// decodeJSONBody decodes a size-limited, time-limited JSON request body into
// destination. On failure it writes the error response (413 when oversized,
// 408 when the client was too slow, 400 otherwise) and returns false.
func (s *Server) decodeJSONBody(w http.ResponseWriter, r *http.Request, destination interface{}) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxJSONBodyBytes)
	clearDeadline := s.limitBodyReadTime(w)

	err := json.NewDecoder(r.Body).Decode(destination)
	if err == nil {
		clearDeadline()
		return true
	}

	var tooLarge *http.MaxBytesError
	switch {
	case errors.As(err, &tooLarge):
		s.writeError(w, "Request body too large", http.StatusRequestEntityTooLarge)
	case errors.Is(err, os.ErrDeadlineExceeded):
		s.writeError(w, "Request body timed out", http.StatusRequestTimeout)
	default:
		s.writeError(w, "Invalid request body", http.StatusBadRequest)
	}
	return false
}

// limitBodyReadTime sets a read deadline on the connection and returns a
// function that lifts it again once the body is read. On failure the deadline
// is left in place on purpose: the server discards the unread rest of the body
// before replying, and that must not wait on the client. Writers that cannot
// set deadlines are left unlimited.
func (s *Server) limitBodyReadTime(w http.ResponseWriter) (clear func()) {
	controller := http.NewResponseController(w)
	timeout := durationOrDefault(s.jsonBodyReadTimeout, defaultJSONBodyReadTimeout)
	if err := controller.SetReadDeadline(time.Now().Add(timeout)); err != nil {
		return func() {}
	}
	return func() { _ = controller.SetReadDeadline(time.Time{}) }
}
