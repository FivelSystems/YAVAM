package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sync"
	"time"
)

// SimpleTokenAuthService implements AuthService using Challenge-Response
type SimpleTokenAuthService struct {
	mu          sync.RWMutex
	validTokens map[string]*User
	nonces      map[string]time.Time // Nonce -> Expiration
	adminHash   string               // SHA256(password)
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
		// Default to "admin" if no config exists
		hash := sha256.Sum256([]byte("admin"))
		hashStr = hex.EncodeToString(hash[:])
		// Save default
		store.Save(&AuthConfig{AdminHash: hashStr})
	}

	s := &SimpleTokenAuthService{
		validTokens: make(map[string]*User),
		nonces:      make(map[string]time.Time),
		adminHash:   hashStr,
		store:       store,
	}

	// Start cleanup routine for nonces
	go s.cleanupNonces()

	return s, nil
}

func (s *SimpleTokenAuthService) SetPassword(newPassword string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	hash := sha256.Sum256([]byte(newPassword))
	hashStr := hex.EncodeToString(hash[:])

	s.adminHash = hashStr
	return s.store.Save(&AuthConfig{AdminHash: hashStr})
}

func (s *SimpleTokenAuthService) InitiateLogin(username string) (string, error) {
	// Simulating single user for now
	if username != "admin" {
		return "", ErrInvalidToken // User not found
	}

	// Generate 16 bytes nonce
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	nonce := hex.EncodeToString(b)

	s.mu.Lock()
	defer s.mu.Unlock()
	// Nonce valid for 2 minutes
	s.nonces[nonce] = time.Now().Add(2 * time.Minute)

	return nonce, nil
}

func (s *SimpleTokenAuthService) CompleteLogin(username, nonce, proof, deviceName string) (string, error) {
	if username != "admin" {
		return "", ErrInvalidToken
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	// Check Nonce validity
	expiry, exists := s.nonces[nonce]
	if !exists {
		return "", fmt.Errorf("invalid or expired nonce")
	}
	if time.Now().After(expiry) {
		delete(s.nonces, nonce)
		return "", fmt.Errorf("nonce expired")
	}
	// Consume nonce (prevent replay)
	delete(s.nonces, nonce)

	// Verify Proof
	// Expected Proof = SHA256(MasterHash + Nonce)
	data := s.adminHash + nonce
	hash := sha256.Sum256([]byte(data))
	expectedProof := hex.EncodeToString(hash[:])

	if proof != expectedProof {
		return "", fmt.Errorf("invalid proof")
	}

	// Generate Token directly here
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

	s.validTokens[token] = &User{
		ID:         sessionID,
		Username:   username,
		Role:       "admin",
		DeviceName: deviceName,
		CreatedAt:  time.Now().Format(time.RFC3339),
		Token:      token,
	}

	return token, nil
}

func (s *SimpleTokenAuthService) ValidateToken(token string) (*User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	user, exists := s.validTokens[token]
	if !exists {
		return nil, ErrInvalidToken
	}
	// TODO: Check expiration if we add time fields later
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
		return nil
	}
	return fmt.Errorf("session not found")
}

// RevokeToken removes a token
func (s *SimpleTokenAuthService) RevokeToken(token string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.validTokens, token)
}

func (s *SimpleTokenAuthService) cleanupNonces() {
	ticker := time.NewTicker(5 * time.Minute)
	for range ticker.C {
		s.mu.Lock()
		now := time.Now()
		for nonce, expiry := range s.nonces {
			if now.After(expiry) {
				delete(s.nonces, nonce)
			}
		}
		s.mu.Unlock()
	}
}
