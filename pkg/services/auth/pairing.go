package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode"
)

const (
	// DefaultPairingTTL is how long a pairing code stays redeemable.
	DefaultPairingTTL = 3 * time.Minute

	// MaxPairingFailures is how many wrong redemptions destroy the outstanding
	// code. The code space (2^40) keeps a guess at roughly 1e-11 per code at
	// this limit; a higher limit only makes deliberately burning a code costlier.
	MaxPairingFailures = 10

	pairingCodeLength      = 8
	pairingCodeGroupLength = 4

	// 32 symbols without 0/O/1/I. The length divides 256, so masking a random
	// byte with len-1 selects symbols without modulo bias.
	pairingAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

	pairedSessionUsername = "admin"
)

var (
	// ErrInvalidPairingCode is the only redemption failure callers see, so a
	// wrong, expired, used or missing code cannot be told apart.
	ErrInvalidPairingCode = errors.New("invalid pairing code")

	// ErrAdminPasswordNotSet refuses pairing while the seeded default password is active.
	ErrAdminPasswordNotSet = errors.New("set an admin password before pairing devices")
)

// PairingCode is returned once to the desktop; only its hash is retained.
type PairingCode struct {
	Code      string
	ExpiresAt time.Time
}

// PairingStatus never carries the code itself.
type PairingStatus struct {
	Active    bool
	ExpiresAt time.Time
}

type pairingState struct {
	codeHash  [sha256.Size]byte
	expiresAt time.Time
	failures  int
}

func hashPairingCode(code string) [sha256.Size]byte {
	return sha256.Sum256([]byte(normalisePairingCode(code)))
}

func normalisePairingCode(code string) string {
	stripped := strings.Map(func(r rune) rune {
		if unicode.IsSpace(r) || r == '-' {
			return -1
		}
		return r
	}, code)
	return strings.ToUpper(stripped)
}

func generatePairingCode() (string, error) {
	random := make([]byte, pairingCodeLength)
	if _, err := rand.Read(random); err != nil {
		return "", err
	}
	symbols := make([]byte, pairingCodeLength)
	for i, b := range random {
		symbols[i] = pairingAlphabet[int(b)&(len(pairingAlphabet)-1)]
	}
	return string(symbols[:pairingCodeGroupLength]) + "-" + string(symbols[pairingCodeGroupLength:]), nil
}

// CreatePairingCode replaces any outstanding code with a fresh one. A
// non-positive ttl selects DefaultPairingTTL.
func (s *SimpleTokenAuthService) CreatePairingCode(ttl time.Duration) (PairingCode, error) {
	if !s.HasCustomPassword() {
		return PairingCode{}, ErrAdminPasswordNotSet
	}
	if ttl <= 0 {
		ttl = DefaultPairingTTL
	}

	code, err := generatePairingCode()
	if err != nil {
		return PairingCode{}, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	expiresAt := s.now().Add(ttl)
	s.pairing = &pairingState{codeHash: hashPairingCode(code), expiresAt: expiresAt}
	return PairingCode{Code: code, ExpiresAt: expiresAt}, nil
}

// PairingStatus reports whether a redeemable code is outstanding.
func (s *SimpleTokenAuthService) PairingStatus() PairingStatus {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if s.pairing == nil || !s.now().Before(s.pairing.expiresAt) {
		return PairingStatus{}
	}
	return PairingStatus{Active: true, ExpiresAt: s.pairing.expiresAt}
}

// RedeemPairingCode consumes the outstanding code and opens a session for the
// named device. A valid deviceID makes it replace that device's earlier
// session. If the session cannot be persisted it is rolled back and the code
// stays consumed, so no session exists that a restart would lose.
func (s *SimpleTokenAuthService) RedeemPairingCode(code, deviceName, deviceID string) (string, error) {
	submitted := hashPairingCode(code)

	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.consumePairingCode(submitted) {
		return "", ErrInvalidPairingCode
	}

	deviceName = sanitizeDeviceName(deviceName, pairedDeviceName)
	deviceID = sanitizeDeviceID(deviceID)
	replaced := s.detachSessionsOfDevice(pairedSessionUsername, deviceID)

	token, evicted, err := s.createSession(pairedSessionUsername, deviceName, deviceID)
	if err != nil {
		s.restoreSessions(replaced)
		return "", err
	}
	if err := s.persistState(); err != nil {
		delete(s.sessions, hashToken(token))
		s.restoreSessions(replaced)
		s.restoreSessions(evicted)
		return "", fmt.Errorf("persist paired session: %w", err)
	}
	return token, nil
}

// consumePairingCode reports whether submitted matches the live code. A match
// destroys the code; the failure that reaches MaxPairingFailures destroys it
// too. Callers must hold s.mu for writing.
func (s *SimpleTokenAuthService) consumePairingCode(submitted [sha256.Size]byte) bool {
	pending := s.pairing
	if pending == nil {
		return false
	}
	if !s.now().Before(pending.expiresAt) {
		s.pairing = nil
		return false
	}

	if subtle.ConstantTimeCompare(submitted[:], pending.codeHash[:]) == 1 {
		s.pairing = nil
		return true
	}

	pending.failures++
	if pending.failures >= MaxPairingFailures {
		s.pairing = nil
	}
	return false
}
