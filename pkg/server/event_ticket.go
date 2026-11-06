package server

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"sync"
	"time"
)

const (
	eventTicketLifetime    = 30 * time.Second
	eventTicketEntropySize = 32
	maxOutstandingTickets  = 256
)

var ErrTicketLimitReached = errors.New("too many outstanding event tickets")

type eventTicketEntry struct {
	sessionToken string
	expiresAt    time.Time
}

// eventTicketStore issues short-lived, single-use tickets that stand in for a
// session token on connections that cannot send an Authorization header.
// Tickets live in memory only.
type eventTicketStore struct {
	mu      sync.Mutex
	now     func() time.Time
	tickets map[string]eventTicketEntry
}

func newEventTicketStore(now func() time.Time) *eventTicketStore {
	if now == nil {
		now = time.Now
	}
	return &eventTicketStore{now: now, tickets: make(map[string]eventTicketEntry)}
}

// Issue creates a ticket bound to the given session token.
func (store *eventTicketStore) Issue(sessionToken string) (string, error) {
	raw := make([]byte, eventTicketEntropySize)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	ticket := hex.EncodeToString(raw)

	store.mu.Lock()
	defer store.mu.Unlock()

	store.removeExpiredLocked()
	if len(store.tickets) >= maxOutstandingTickets {
		return "", ErrTicketLimitReached
	}
	store.tickets[ticket] = eventTicketEntry{
		sessionToken: sessionToken,
		expiresAt:    store.now().Add(eventTicketLifetime),
	}
	return ticket, nil
}

// Consume invalidates the ticket and returns the session token it was bound to.
// The caller must still validate that session.
func (store *eventTicketStore) Consume(ticket string) (string, bool) {
	store.mu.Lock()
	defer store.mu.Unlock()

	store.removeExpiredLocked()
	entry, found := store.tickets[ticket]
	if !found {
		return "", false
	}
	delete(store.tickets, ticket)
	return entry.sessionToken, true
}

func (store *eventTicketStore) removeExpiredLocked() {
	now := store.now()
	for ticket, entry := range store.tickets {
		if !now.Before(entry.expiresAt) {
			delete(store.tickets, ticket)
		}
	}
}
