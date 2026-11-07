package server

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestBareServerIssuesAndRedeemsTicket(t *testing.T) {
	s := &Server{}

	ticket, err := s.ticketStore().Issue("session-token")
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}
	token, ok := s.ticketStore().Consume(ticket)
	if !ok || token != "session-token" {
		t.Errorf("Consume = %q, %v", token, ok)
	}
}

func TestBareServerTicketEndpointDoesNotPanic(t *testing.T) {
	s := &Server{auth: &MockAuthService{validToken: "tok"}}

	req := newTestRequest(http.MethodPost, "/api/events/ticket", nil)
	req.Header.Set("Authorization", "Bearer tok")
	rec := httptest.NewRecorder()
	s.handleEventTicket(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", rec.Code)
	}
}
