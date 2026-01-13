package main

import (
	"varmanager/pkg/services/auth"
)

// ListSessions returns all active sessions
func (a *App) ListSessions() ([]auth.User, error) {
	if a.auth == nil {
		return nil, nil
	}
	return a.auth.ListSessions()
}

// RevokeSession removes a session by ID
func (a *App) RevokeSession(id string) error {
	if a.auth == nil {
		return nil
	}
	return a.auth.RevokeSession(id)
}
