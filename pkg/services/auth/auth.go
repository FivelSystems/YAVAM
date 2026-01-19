package auth

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// SimpleTokenAuthService implements AuthService using Bcrypt
type SimpleTokenAuthService struct {
	mu          sync.RWMutex
	validTokens map[string]*User
	adminHash   string // Bcrypt hash of password
	store       *FileAuthStore
}

func NewSimpleAuthService(configPath string) (*SimpleTokenAuthService, error) {
	store := NewFileAuthStore(configPath)
	config, err := store.Load()
	if err != nil {
		return nil, err
	}

	var hashStr string
	if config != nil && config.AdminHash != "" {
		hashStr = config.AdminHash
	} else {
		// Default to "admin"
		// Generate bcrypt hash for "admin"
		hash, _ := bcrypt.GenerateFromPassword([]byte("admin"), bcrypt.DefaultCost)
		hashStr = string(hash)
		// Save default
		store.Save(&AuthConfig{AdminHash: hashStr})
	}

	// Load sessions if present
	validTokens := make(map[string]*User)
	if config != nil && config.Sessions != nil {
		validTokens = config.Sessions
		// Restore Token field since it's not persisted
		for token, user := range validTokens {
			if user.Token == "" {
				user.Token = token
			}
		}
	}

	s := &SimpleTokenAuthService{
		validTokens: validTokens,
		adminHash:   hashStr,
		store:       store,
	}

	return s, nil
}

// Helper to save current state
func (s *SimpleTokenAuthService) persistState() error {
	return s.store.Save(&AuthConfig{
		AdminHash: s.adminHash,
		Sessions:  s.validTokens,
	})
}

func (s *SimpleTokenAuthService) SetPassword(newPassword string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	s.adminHash = string(hash)
	return s.persistState()
}

// InitiateLogin is deprecated/noop in bcrypt flow but kept for interface/api compatibility if strictly needed,
// but we will likely remove calls to it.
func (s *SimpleTokenAuthService) InitiateLogin(username string) (string, error) {
	return "bcrypt-mode", nil
}

// Login verifies credentials directly using Bcrypt
func (s *SimpleTokenAuthService) Login(username, password, deviceName string) (string, error) {
	if username != "admin" {
		return "", ErrInvalidToken
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	// Verify Password
	err := bcrypt.CompareHashAndPassword([]byte(s.adminHash), []byte(password))
	if err != nil {
		return "", fmt.Errorf("invalid credentials")
	}

	// Generate Token
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	token := hex.EncodeToString(b)

	// Generate Session ID
	sid := make([]byte, 8)
	rand.Read(sid)
	sessionID := hex.EncodeToString(sid)

	if deviceName == "" {
		deviceName = "Unknown Device"
	}

	// Deduplicate: Remove any existing session for this device
	for oldToken, user := range s.validTokens {
		if user.DeviceName == deviceName && user.Username == username {
			delete(s.validTokens, oldToken)
		}
	}

	s.validTokens[token] = &User{
		ID:         sessionID,
		Username:   username,
		Role:       "admin",
		DeviceName: deviceName,
		CreatedAt:  time.Now().Format(time.RFC3339),
		Token:      token,
	}

	if err := s.persistState(); err != nil {
		fmt.Printf("Failed to persist session: %v\n", err)
	}

	return token, nil
}

// Deprecated: CompleteLogin was for CR-Auth. Kept stub to prevent compile errors if interface not changed yet.
func (s *SimpleTokenAuthService) CompleteLogin(username, nonce, proof, deviceName string) (string, error) {
	return "", fmt.Errorf("use Login() instead")
}

func (s *SimpleTokenAuthService) ValidateToken(token string) (*User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	user, exists := s.validTokens[token]
	if !exists {
		return nil, ErrInvalidToken
	}
	return user, nil
}

func (s *SimpleTokenAuthService) GenerateToken() (string, error) {
	// Internal use
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	token := hex.EncodeToString(b)

	s.mu.Lock()
	defer s.mu.Unlock()

	// Generate Session ID
	sid := make([]byte, 8)
	rand.Read(sid)
	sessionID := hex.EncodeToString(sid)

	s.validTokens[token] = &User{
		ID:         sessionID,
		Username:   "system",
		Role:       "admin",
		DeviceName: "Local System",
		CreatedAt:  time.Now().Format(time.RFC3339),
		Token:      token,
	}
	s.persistState()
	return token, nil
}

func (s *SimpleTokenAuthService) ListSessions() ([]User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var sessions []User
	for _, user := range s.validTokens {
		sessions = append(sessions, *user)
	}
	return sessions, nil
}

func (s *SimpleTokenAuthService) RevokeSession(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	var tokenToRevoke string
	for token, user := range s.validTokens {
		if user.ID == id {
			tokenToRevoke = token
			break
		}
	}

	if tokenToRevoke != "" {
		delete(s.validTokens, tokenToRevoke)
		return s.persistState()
	}
	return fmt.Errorf("session not found")
}

func (s *SimpleTokenAuthService) RevokeToken(token string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.validTokens, token)
	s.persistState()
}

func (s *SimpleTokenAuthService) cleanupNonces() {
	// No nonces in bcrypt mode
}
