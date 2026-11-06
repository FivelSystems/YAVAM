package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"yavam/pkg/services/auth"
)

type slideCountingAuth struct {
	*revocableAuthService
	slides atomic.Int32
}

func (a *slideCountingAuth) ValidateToken(token string) (*auth.User, error) {
	a.slides.Add(1)
	return a.revocableAuthService.ValidateToken(token)
}

func TestTicketIssueAndStreamConnectDoNotSlideSession(t *testing.T) {
	spy := &slideCountingAuth{revocableAuthService: newRevocableAuth("valid")}
	s := newTicketTestServer(t, spy, &fakeClock{now: time.Now()})

	code, ticket := requestTicket(t, s, "valid")
	if code != http.StatusOK {
		t.Fatalf("ticket issue: got %d", code)
	}
	if w := openStreamWithTicket(s, ticket); w.Code != http.StatusOK {
		t.Fatalf("ticket connect: got %d", w.Code)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/events", nil)
	req.Header.Set("Authorization", "Bearer valid")
	ctx, cancel := context.WithTimeout(req.Context(), 100*time.Millisecond)
	defer cancel()
	w := httptest.NewRecorder()
	s.httpSrv.Handler.ServeHTTP(w, req.WithContext(ctx))
	if w.Code != http.StatusOK {
		t.Fatalf("bearer connect: got %d", w.Code)
	}

	if slides := spy.slides.Load(); slides != 0 {
		t.Errorf("ticket issue and stream connect slid the session %d times", slides)
	}
}

func TestRegularAuthMiddlewareStillSlidesSession(t *testing.T) {
	spy := &slideCountingAuth{revocableAuthService: newRevocableAuth("valid")}
	s := &Server{auth: spy}
	handler := s.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))

	req := httptest.NewRequest(http.MethodGet, "/api/anything", nil)
	req.Header.Set("Authorization", "Bearer valid")
	handler.ServeHTTP(httptest.NewRecorder(), req)

	if slides := spy.slides.Load(); slides != 1 {
		t.Errorf("regular API request should slide the session once, got %d", slides)
	}
}
