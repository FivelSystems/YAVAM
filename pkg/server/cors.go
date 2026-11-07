package server

import (
	"net/http"
	"net/url"
	"strings"
)

const (
	headerOrigin       = "Origin"
	headerVary         = "Vary"
	headerAllowOrigin  = "Access-Control-Allow-Origin"
	headerAllowMethods = "Access-Control-Allow-Methods"
	headerAllowHeaders = "Access-Control-Allow-Headers"
	allowedCORSMethods = "GET, POST, OPTIONS, PUT, DELETE"
	allowedCORSHeaders = "Content-Type, Authorization, X-Requested-With, Accept, Origin"
	schemeHTTP         = "http"
	schemeHTTPS        = "https"
)

// isSameOrigin reports whether the request's Origin header names the very
// host and scheme the request was addressed to. The bundled web client is
// served by this server, so it never needs more than this.
func isSameOrigin(r *http.Request) bool {
	origin := r.Header.Get(headerOrigin)
	if origin == "" {
		return false
	}
	parsed, err := url.Parse(origin)
	if err != nil || parsed.Host == "" || parsed.Path != "" || parsed.User != nil {
		return false
	}
	expectedScheme := schemeHTTP
	if r.TLS != nil {
		expectedScheme = schemeHTTPS
	}
	return parsed.Scheme == expectedScheme && strings.EqualFold(parsed.Host, r.Host)
}

// applyCORSHeaders adds cross-origin headers only for same-origin requests and
// reports whether the request's Origin was accepted. Origins are never
// reflected otherwise and a wildcard is never emitted.
func applyCORSHeaders(w http.ResponseWriter, r *http.Request) bool {
	w.Header().Add(headerVary, headerOrigin)
	if !isSameOrigin(r) {
		return false
	}
	w.Header().Set(headerAllowOrigin, r.Header.Get(headerOrigin))
	w.Header().Set(headerAllowMethods, allowedCORSMethods)
	w.Header().Set(headerAllowHeaders, allowedCORSHeaders)
	return true
}
