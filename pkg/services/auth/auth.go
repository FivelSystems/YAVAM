package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log"
	"sync"
	"time"
	"unicode/utf8"

	"golang.org/x/crypto/bcrypt"
)

const (
	// SessionAbsoluteLifetime is the maximum age of a session regardless of activity.
	SessionAbsoluteLifetime = 30 * 24 * time.Hour

	// SessionIdleTimeout is how long a session may go unused before it expires.
	SessionIdleTimeout = 14 * 24 * time.Hour

	// persistRetryInterval bounds how often sliding last-used updates are
	// written to disk, and how often a failing write is retried or logged.
	persistRetryInterval = time.Minute

	tokenByteLength     = 32
	sessionIDByteLength = 8

	// MinPasswordLength is the shortest admin password SetPassword accepts.
	MinPasswordLength = 8

	// defaultAdminPassword only seeds a fresh install; SetPassword rejects it.
	defaultAdminPassword = "admin"
)

// authStore is the persistence the service needs; tests substitute failing ones.
type authStore interface {
	Load() (*AuthConfig, error)
	Save(config *AuthConfig) error
}

// SimpleTokenAuthService implements AuthService using Bcrypt
type SimpleTokenAuthService struct {
	mu        sync.RWMutex
	sessions  map[string]*StoredSession // keyed by hashToken(token)
	adminHash string                    // Bcrypt hash of password
	store     authStore
	now       func() time.Time
	pairing   *pairingState // outstanding one-time pairing code, memory only

	// hasCustomPassword caches the bcrypt comparison against the seeded default,
	// so unauthenticated endpoints that consult it cost nothing per request.
	// It changes only where adminHash changes: construction and SetPassword.
	hasCustomPassword bool

	// lastPersistAttemptAt advances on failed writes too, so a failing disk is
	// retried (and logged) once per persistRetryInterval, not on every request.
	lastPersistAttemptAt time.Time
	lastFailureLoggedAt  time.Time
}

func NewSimpleAuthService(configPath string) (*SimpleTokenAuthService, error) {
	return NewSimpleAuthServiceWithClock(configPath, time.Now)
}

// NewSimpleAuthServiceWithClock lets tests control session expiry without sleeping.
func NewSimpleAuthServiceWithClock(configPath string, now func() time.Time) (*SimpleTokenAuthService, error) {
	return newSimpleAuthServiceWithStore(NewFileAuthStore(configPath), now)
}

func newSimpleAuthServiceWithStore(store authStore, now func() time.Time) (*SimpleTokenAuthService, error) {
	config, err := store.Load()
	if err != nil {
		return nil, err
	}

	var hashStr string
	if config != nil && config.AdminHash != "" {
		hashStr = config.AdminHash
	} else {
		hash, err := bcrypt.GenerateFromPassword([]byte(defaultAdminPassword), bcrypt.DefaultCost)
		if err != nil {
			return nil, err
		}
		hashStr = string(hash)
		if err := store.Save(&AuthConfig{AdminHash: hashStr}); err != nil {
			return nil, err
		}
	}

	s := &SimpleTokenAuthService{
		sessions:          make(map[string]*StoredSession),
		adminHash:         hashStr,
		hasCustomPassword: differsFromDefaultPassword(hashStr),
		store:             store,
		now:               now,
	}

	needsPersist, migratedHashes := s.loadSessions(config)
	if needsPersist {
		if err := s.persistState(); err != nil {
			// Plaintext legacy tokens would stay on disk, so do not honour them
			// in memory either; their owners simply log in again.
			for _, tokenHash := range migratedHashes {
				delete(s.sessions, tokenHash)
			}
			log.Printf("Failed to persist migrated sessions, dropped %d legacy sessions: %v", len(migratedHashes), err)
		}
	}
	s.lastPersistAttemptAt = s.now()

	return s, nil
}

// loadSessions restores persisted sessions, converting legacy raw-token
// entries into hashed ones and dropping expired ones. It reports whether the
// on-disk file must be rewritten and which hashes came from legacy entries.
// A legacy entry never overwrites an already-hashed record.
func (s *SimpleTokenAuthService) loadSessions(config *AuthConfig) (needsPersist bool, migratedHashes []string) {
	if config == nil {
		return false, nil
	}
	now := s.now()

	for tokenHash, session := range config.Sessions {
		if session == nil || s.isExpired(session, now) {
			needsPersist = true
			continue
		}
		s.sessions[tokenHash] = session
	}

	for rawToken, legacy := range config.LegacySessions {
		needsPersist = true
		if legacy == nil {
			continue
		}
		tokenHash := hashToken(rawToken)
		if _, alreadyHashed := s.sessions[tokenHash]; alreadyHashed {
			continue
		}
		s.sessions[tokenHash] = &StoredSession{
			ID:         legacy.ID,
			Username:   legacy.Username,
			Role:       legacy.Role,
			DeviceName: legacy.DeviceName,
			IPAddress:  legacy.IPAddress,
			CreatedAt:  now,
			LastUsedAt: now,
		}
		migratedHashes = append(migratedHashes, tokenHash)
	}

	return needsPersist, migratedHashes
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func randomHex(byteLength int) (string, error) {
	b := make([]byte, byteLength)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func (s *SimpleTokenAuthService) isExpired(session *StoredSession, now time.Time) bool {
	return now.Sub(session.CreatedAt) >= SessionAbsoluteLifetime ||
		now.Sub(session.LastUsedAt) >= SessionIdleTimeout
}

func (s *SimpleTokenAuthService) persistState() error {
	s.lastPersistAttemptAt = s.now()
	return s.store.Save(&AuthConfig{
		AdminHash: s.adminHash,
		Sessions:  s.sessions,
	})
}

// SetPassword changes the admin password and revokes every session in one
// persisted write. In-memory state is replaced only after the write succeeds,
// so on failure both the previous password and the existing sessions stay in
// effect. Open event streams are closed by their next CheckToken recheck.
func (s *SimpleTokenAuthService) SetPassword(newPassword string) error {
	if err := validateNewPassword(newPassword); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	revokedSessions := make(map[string]*StoredSession)
	s.lastPersistAttemptAt = s.now()
	if err := s.store.Save(&AuthConfig{AdminHash: string(hash), Sessions: revokedSessions}); err != nil {
		return err
	}
	s.adminHash = string(hash)
	s.hasCustomPassword = differsFromDefaultPassword(s.adminHash)
	s.sessions = revokedSessions
	s.pairing = nil
	return nil
}

func validateNewPassword(password string) error {
	if password == defaultAdminPassword {
		return ErrPasswordIsDefault
	}
	if utf8.RuneCountInString(password) < MinPasswordLength {
		return ErrPasswordTooShort
	}
	return nil
}

func differsFromDefaultPassword(hash string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(defaultAdminPassword)) != nil
}

// HasCustomPassword reports whether the stored hash no longer matches the
// seeded default. The answer is cached, so this is a cheap read.
func (s *SimpleTokenAuthService) HasCustomPassword() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.hasCustomPassword
}

// InitiateLogin is deprecated/noop in bcrypt flow but kept for interface/api compatibility if strictly needed,
// but we will likely remove calls to it.
func (s *SimpleTokenAuthService) InitiateLogin(username string) (string, error) {
	return "bcrypt-mode", nil
}

// createSession registers a new session and returns the raw token, which is
// never stored. Callers must hold s.mu for writing.
func (s *SimpleTokenAuthService) createSession(username, deviceName string) (string, error) {
	token, err := randomHex(tokenByteLength)
	if err != nil {
		return "", err
	}
	sessionID, err := randomHex(sessionIDByteLength)
	if err != nil {
		return "", err
	}

	now := s.now()
	s.sessions[hashToken(token)] = &StoredSession{
		ID:         sessionID,
		Username:   username,
		Role:       "admin",
		DeviceName: deviceName,
		CreatedAt:  now,
		LastUsedAt: now,
	}
	return token, nil
}

// Login verifies credentials directly using Bcrypt
func (s *SimpleTokenAuthService) Login(username, password, deviceName string) (string, error) {
	if username != "admin" {
		return "", ErrInvalidToken
	}

	s.mu.RLock()
	verifiedHash := s.adminHash
	s.mu.RUnlock()

	if err := bcrypt.CompareHashAndPassword([]byte(verifiedHash), []byte(password)); err != nil {
		return "", fmt.Errorf("invalid credentials")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if s.adminHash != verifiedHash {
		return "", fmt.Errorf("invalid credentials")
	}

	if deviceName == "" {
		deviceName = "Unknown Device"
	}

	for tokenHash, session := range s.sessions {
		if session.DeviceName == deviceName && session.Username == username {
			delete(s.sessions, tokenHash)
		}
	}

	token, err := s.createSession(username, deviceName)
	if err != nil {
		return "", err
	}

	if err := s.persistState(); err != nil {
		log.Printf("Failed to persist session: %v", err)
	}

	return token, nil
}

// Deprecated: CompleteLogin was for CR-Auth. Kept stub to prevent compile errors if interface not changed yet.
func (s *SimpleTokenAuthService) CompleteLogin(username, nonce, proof, deviceName string) (string, error) {
	return "", fmt.Errorf("use Login() instead")
}

// ValidateToken returns the session owning token, extending its idle window.
// Expired sessions are deleted and reported as ErrInvalidToken. The returned
// User is a copy that carries the presented token.
func (s *SimpleTokenAuthService) ValidateToken(token string) (*User, error) {
	return s.lookupSession(token, true)
}

// CheckToken applies the same lookup, expiry and revocation rules as
// ValidateToken but leaves the idle window untouched, so background
// re-verification does not keep a session alive.
func (s *SimpleTokenAuthService) CheckToken(token string) (*User, error) {
	return s.lookupSession(token, false)
}

func (s *SimpleTokenAuthService) lookupSession(token string, slideIdleWindow bool) (*User, error) {
	tokenHash := hashToken(token)
	now := s.now()

	s.mu.Lock()
	defer s.mu.Unlock()

	session, exists := s.sessions[tokenHash]
	if !exists {
		return nil, ErrInvalidToken
	}

	if s.isExpired(session, now) {
		delete(s.sessions, tokenHash)
		s.persistOrLog()
		return nil, ErrInvalidToken
	}

	if slideIdleWindow {
		session.LastUsedAt = now
		if now.Sub(s.lastPersistAttemptAt) >= persistRetryInterval {
			s.persistOrLog()
		}
	}

	user := toUser(session)
	user.Token = token
	return &user, nil
}

func (s *SimpleTokenAuthService) persistOrLog() {
	err := s.persistState()
	if err == nil {
		return
	}
	now := s.now()
	if now.Sub(s.lastFailureLoggedAt) >= persistRetryInterval {
		s.lastFailureLoggedAt = now
		log.Printf("Failed to persist sessions: %v", err)
	}
}

func toUser(session *StoredSession) User {
	return User{
		ID:         session.ID,
		Username:   session.Username,
		Role:       session.Role,
		DeviceName: session.DeviceName,
		IPAddress:  session.IPAddress,
		CreatedAt:  session.CreatedAt.Format(time.RFC3339),
	}
}

func (s *SimpleTokenAuthService) GenerateToken() (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	token, err := s.createSession("system", "Local System")
	if err != nil {
		return "", err
	}
	s.persistOrLog()
	return token, nil
}

func (s *SimpleTokenAuthService) ListSessions() ([]User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	now := s.now()
	var sessions []User
	for _, session := range s.sessions {
		if s.isExpired(session, now) {
			continue
		}
		sessions = append(sessions, toUser(session))
	}
	return sessions, nil
}

func (s *SimpleTokenAuthService) RevokeSession(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for tokenHash, session := range s.sessions {
		if session.ID == id {
			delete(s.sessions, tokenHash)
			return s.persistState()
		}
	}
	return fmt.Errorf("session not found")
}

func (s *SimpleTokenAuthService) RevokeToken(token string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.sessions, hashToken(token))
	s.persistOrLog()
}
