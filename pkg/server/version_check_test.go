package server

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestVersionCheckRequiresAuthentication(t *testing.T) {
	s := startUploadTestServer(t, t.TempDir())

	cases := map[string]string{
		"no credentials": "",
		"invalid token":  "Bearer not-a-session",
	}
	for name, authorization := range cases {
		t.Run(name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/version/check", nil)
			if authorization != "" {
				req.Header.Set("Authorization", authorization)
			}
			rec := httptest.NewRecorder()
			s.httpSrv.Handler.ServeHTTP(rec, req)
			if rec.Code != http.StatusUnauthorized {
				t.Fatalf("status = %d, want 401", rec.Code)
			}
		})
	}
}
