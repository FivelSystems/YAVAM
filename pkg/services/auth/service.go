package auth

import (
	"errors"
)

var (
	ErrInvalidToken = errors.New("invalid or expired token")
)

// User represents an authenticated user (simplified for now)
type User struct {
	Username string `json:"username"`
	Role     string `json:"role"`
}

// AuthService handles authentication and token management
type AuthService interface {
	// InitiateLogin starts the login process by generating a nonce for the user
	InitiateLogin(username string) (string, error)

	// CompleteLogin verifies the proof (SHA256(SHA256(pass) + nonce)) and returns a token
	CompleteLogin(username, nonce, proof string) (string, error)

	// ValidateToken checks if a token is valid and returns the associated user
	ValidateToken(token string) (*User, error)

	// GenerateToken creates a new token for internal use (e.g. startup)
	GenerateToken() (string, error)

	// RevokeToken removes a token
	RevokeToken(token string)
}
