package auth

import (
	"errors"
	"time"
)

var (
	ErrInvalidToken = errors.New("invalid or expired token")

	ErrPasswordTooShort  = errors.New("password is too short")
	ErrPasswordIsDefault = errors.New("password must not be the default password")
)

// User represents an authenticated session
type User struct {
	ID         string `json:"id"`
	Username   string `json:"username"`
	Role       string `json:"role"`
	DeviceName string `json:"deviceName"`
	IPAddress  string `json:"ipAddress"`
	CreatedAt  string `json:"createdAt"` // ISO or timestamp
	// IsSystem is true only for the session the application opened for itself.
	// It comes from the session's identity, never from DeviceName, which a
	// client chooses.
	IsSystem bool   `json:"isSystem"`
	Token    string `json:"-"` // Internal use
}

// AuthService handles authentication and token management
type AuthService interface {
	// InitiateLogin starts the login process by generating a nonce for the user
	InitiateLogin(username string) (string, error)

	// CompleteLogin verifies the proof and returns a token
	CompleteLogin(username, nonce, proof, deviceName string) (string, error)

	// ValidateToken checks if a token is valid and returns the associated user
	ValidateToken(token string) (*User, error)

	// CheckToken validates like ValidateToken without extending the session
	CheckToken(token string) (*User, error)

	// GenerateToken creates a new token for internal use
	GenerateToken() (string, error)

	// RevokeToken removes a token
	RevokeToken(token string)

	// ListSessions returns all active sessions
	ListSessions() ([]User, error)

	// RevokeSession removes a session by ID
	RevokeSession(id string) error

	// Login verifies credentials directly. deviceID is optional; a valid one
	// makes the new session replace the earlier session of the same device.
	Login(username, password, deviceName, deviceID string) (string, error)

	// SetPassword updates the admin password, enforcing the password rules
	SetPassword(newPassword string) error

	// HasCustomPassword reports whether the admin password differs from the seeded default
	HasCustomPassword() bool

	// CreatePairingCode issues the single outstanding one-time pairing code
	CreatePairingCode(ttl time.Duration) (PairingCode, error)

	// RedeemPairingCode consumes a pairing code and returns a session token
	RedeemPairingCode(code, deviceName, deviceID string) (string, error)

	// PairingStatus reports whether a pairing code is outstanding, never the code itself
	PairingStatus() PairingStatus
}
