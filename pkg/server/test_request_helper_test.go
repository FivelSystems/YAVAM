package server

import (
	"io"
	"net/http"
	"net/http/httptest"
)

// newTestRequest builds a request addressed to a host the server accepts;
// httptest's own default, example.com, is deliberately refused.
func newTestRequest(method, target string, body io.Reader) *http.Request {
	request := httptest.NewRequest(method, target, body)
	request.Host = testLocalHost
	return request
}
