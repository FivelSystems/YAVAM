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
}

func NewSimpleAuthService(adminPassword string) *SimpleTokenAuthService {
	// Store only the hash of the password
	hash := sha256.Sum256([]byte(adminPassword))
	hashStr := hex.EncodeToString(hash[:])

	s := &SimpleTokenAuthService{
		validTokens: make(map[string]*User),
		nonces:      make(map[string]time.Time),
		adminHash:   hashStr,
	}

	// Start cleanup routine for nonces
	go s.cleanupNonces()

	return s
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

func (s *SimpleTokenAuthService) CompleteLogin(username, nonce, proof string) (string, error) {
	if username != "admin" {
		return "", ErrInvalidToken
	}

	s.mu.Lock()
	// Check Nonce validity
	expiry, exists := s.nonces[nonce]
	if !exists {
		s.mu.Unlock()
		return "", fmt.Errorf("invalid or expired nonce")
	}
	if time.Now().After(expiry) {
		delete(s.nonces, nonce)
		s.mu.Unlock()
		return "", fmt.Errorf("nonce expired")
	}
	// Consume nonce (prevent replay)
	delete(s.nonces, nonce)
	s.mu.Unlock()

	// Verify Proof
	// Expected Proof = SHA256(MasterHash + Nonce)
	// MasterHash is already hex string, Nonce is hex string.
	// We concat them as strings.
	data := s.adminHash + nonce
	hash := sha256.Sum256([]byte(data))
	expectedProof := hex.EncodeToString(hash[:])

	if proof != expectedProof {
		return "", fmt.Errorf("invalid proof")
	}

	// Proof Valid! Generate Token
	return s.GenerateToken()
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
	// Generate 32 bytes of entropy
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	token := hex.EncodeToString(b)

	s.mu.Lock()
	defer s.mu.Unlock()

	// Store token for "admin"
	s.validTokens[token] = &User{
		Username: "admin",
		Role:     "admin",
	}

	return token, nil
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
