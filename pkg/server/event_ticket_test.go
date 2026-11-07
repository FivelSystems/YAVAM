package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
	"yavam/pkg/manager"
	"yavam/pkg/services/auth"
)

type revocableAuthService struct {
	MockAuthService
	mu     sync.Mutex
	active map[string]bool
}

func newRevocableAuth(tokens ...string) *revocableAuthService {
	service := &revocableAuthService{active: map[string]bool{}}
	for _, token := range tokens {
		service.active[token] = true
	}
	return service
}

func (a *revocableAuthService) ValidateToken(token string) (*auth.User, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.active[token] {
		return &auth.User{Username: "admin"}, nil
	}
	return nil, auth.ErrInvalidToken
}

func (a *revocableAuthService) CheckToken(token string) (*auth.User, error) {
	return a.ValidateToken(token)
}

func (a *revocableAuthService) revoke(token string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	delete(a.active, token)
}

type fakeClock struct {
	mu  sync.Mutex
	now time.Time
}

func (c *fakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.now
}

func (c *fakeClock) Advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.now = c.now.Add(d)
}

func newTicketTestServer(t *testing.T, authService auth.AuthService, clock *fakeClock) *Server {
	t.Helper()
	mgr := manager.NewManager(nil, nil, &TestServerConfigService{libraries: []string{"C:/Allowed"}})
	s := NewServer(context.Background(), mgr, authService, mockAssets, "1.0.0", func() {})
	s.SkipEvents = true
	s.tickets = newEventTicketStore(clock.Now)
	s.sessionRecheckInterval = 20 * time.Millisecond
	if err := s.Start("127.0.0.1", "0", []string{"C:/Allowed"}); err != nil {
		t.Fatalf("Start() failed: %v", err)
	}
	t.Cleanup(func() { s.Stop() })
	return s
}

func requestTicket(t *testing.T, s *Server, bearer string) (int, string) {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/events/ticket", nil)
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	w := httptest.NewRecorder()
	s.httpSrv.Handler.ServeHTTP(w, req)
	var body struct {
		Ticket string `json:"ticket"`
	}
	json.NewDecoder(w.Body).Decode(&body)
	return w.Code, body.Ticket
}

func openStreamWithTicket(s *Server, ticket string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, "/api/events?ticket="+ticket, nil)
	ctx, cancel := context.WithTimeout(req.Context(), 200*time.Millisecond)
	defer cancel()
	w := httptest.NewRecorder()
	s.httpSrv.Handler.ServeHTTP(w, req.WithContext(ctx))
	return w
}

func TestEventTicket_IssueRequiresAuth(t *testing.T) {
	s := newTicketTestServer(t, newRevocableAuth("valid"), &fakeClock{now: time.Now()})

	if code, _ := requestTicket(t, s, ""); code != http.StatusUnauthorized {
		t.Errorf("no auth: expected 401, got %d", code)
	}
	if code, _ := requestTicket(t, s, "bogus"); code != http.StatusUnauthorized {
		t.Errorf("bad token: expected 401, got %d", code)
	}
	code, ticket := requestTicket(t, s, "valid")
	if code != http.StatusOK || len(ticket) < eventTicketEntropySize*2 {
		t.Errorf("valid: expected 200 and a long ticket, got %d %q", code, ticket)
	}
}

func TestEventTicket_SingleUse(t *testing.T) {
	s := newTicketTestServer(t, newRevocableAuth("valid"), &fakeClock{now: time.Now()})
	_, ticket := requestTicket(t, s, "valid")

	if w := openStreamWithTicket(s, ticket); w.Code != http.StatusOK {
		t.Fatalf("first use: expected 200, got %d", w.Code)
	}
	if w := openStreamWithTicket(s, ticket); w.Code != http.StatusUnauthorized {
		t.Errorf("reuse: expected 401, got %d", w.Code)
	}
}

func TestEventTicket_Expires(t *testing.T) {
	clock := &fakeClock{now: time.Now()}
	s := newTicketTestServer(t, newRevocableAuth("valid"), clock)
	_, ticket := requestTicket(t, s, "valid")

	clock.Advance(eventTicketLifetime + time.Second)
	if w := openStreamWithTicket(s, ticket); w.Code != http.StatusUnauthorized {
		t.Errorf("expired: expected 401, got %d", w.Code)
	}
}

func TestEventTicket_RevokedSessionRejected(t *testing.T) {
	authService := newRevocableAuth("valid")
	s := newTicketTestServer(t, authService, &fakeClock{now: time.Now()})
	_, ticket := requestTicket(t, s, "valid")

	authService.revoke("valid")
	if w := openStreamWithTicket(s, ticket); w.Code != http.StatusUnauthorized {
		t.Errorf("revoked session: expected 401, got %d", w.Code)
	}
}

func TestEventTicket_UnknownTicketRejected(t *testing.T) {
	s := newTicketTestServer(t, newRevocableAuth("valid"), &fakeClock{now: time.Now()})
	if w := openStreamWithTicket(s, "deadbeef"); w.Code != http.StatusUnauthorized {
		t.Errorf("unknown ticket: expected 401, got %d", w.Code)
	}
}

func TestEvents_LongLivedQueryTokenNotAccepted(t *testing.T) {
	s := newTicketTestServer(t, newRevocableAuth("valid"), &fakeClock{now: time.Now()})

	req := httptest.NewRequest(http.MethodGet, "/api/events?token=valid", nil)
	w := httptest.NewRecorder()
	s.httpSrv.Handler.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("/api/events?token=: expected 401, got %d", w.Code)
	}
}

func TestEvents_BearerHeaderStillAccepted(t *testing.T) {
	s := newTicketTestServer(t, newRevocableAuth("valid"), &fakeClock{now: time.Now()})

	req := httptest.NewRequest(http.MethodGet, "/api/events", nil)
	req.Header.Set("Authorization", "Bearer valid")
	ctx, cancel := context.WithTimeout(req.Context(), 100*time.Millisecond)
	defer cancel()
	w := httptest.NewRecorder()
	s.httpSrv.Handler.ServeHTTP(w, req.WithContext(ctx))
	if w.Code != http.StatusOK {
		t.Errorf("bearer: expected 200, got %d", w.Code)
	}
}

func TestEvents_OtherRoutesStillAcceptQueryToken(t *testing.T) {
	s := newTicketTestServer(t, newRevocableAuth("valid"), &fakeClock{now: time.Now()})

	for _, path := range []string{"/api/thumbnail?filePath=x&token=valid", "/files/?path=x&token=valid"} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		w := httptest.NewRecorder()
		s.httpSrv.Handler.ServeHTTP(w, req)
		if w.Code == http.StatusUnauthorized {
			t.Errorf("%s: query token should still authenticate, got 401", path)
		}
	}
}

func TestEventTicket_OutstandingCap(t *testing.T) {
	clock := &fakeClock{now: time.Now()}
	store := newEventTicketStore(clock.Now)

	for i := 0; i < maxOutstandingTickets; i++ {
		if _, err := store.Issue("session"); err != nil {
			t.Fatalf("issue %d failed: %v", i, err)
		}
	}
	if _, err := store.Issue("session"); err != ErrTicketLimitReached {
		t.Errorf("expected ErrTicketLimitReached, got %v", err)
	}

	clock.Advance(eventTicketLifetime + time.Second)
	if _, err := store.Issue("session"); err != nil {
		t.Errorf("expired tickets should free capacity, got %v", err)
	}
	if len(store.tickets) != 1 {
		t.Errorf("expected expired entries cleaned up, have %d", len(store.tickets))
	}
}

func TestEventTicket_CapReturns429(t *testing.T) {
	s := newTicketTestServer(t, newRevocableAuth("valid"), &fakeClock{now: time.Now()})
	for i := 0; i < maxOutstandingTickets; i++ {
		if code, _ := requestTicket(t, s, "valid"); code != http.StatusOK {
			t.Fatalf("issue %d: got %d", i, code)
		}
	}
	if code, _ := requestTicket(t, s, "valid"); code != http.StatusTooManyRequests {
		t.Errorf("expected 429, got %d", code)
	}
}

func TestEvents_StreamEndsWhenSessionRevoked(t *testing.T) {
	authService := newRevocableAuth("valid")
	s := newTicketTestServer(t, authService, &fakeClock{now: time.Now()})

	req := httptest.NewRequest(http.MethodGet, "/api/events", nil)
	req.Header.Set("Authorization", "Bearer valid")
	ctx, cancel := context.WithTimeout(req.Context(), 5*time.Second)
	defer cancel()

	finished := make(chan struct{})
	go func() {
		s.httpSrv.Handler.ServeHTTP(httptest.NewRecorder(), req.WithContext(ctx))
		close(finished)
	}()

	authService.revoke("valid")
	select {
	case <-finished:
	case <-time.After(2 * time.Second):
		t.Fatal("stream did not end after session revocation")
	}
}
