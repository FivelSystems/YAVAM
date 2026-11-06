package auth

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"
)

const authFilePermissions = 0600

// StoredSession is the persisted form of a session. It is keyed in
// AuthConfig by the SHA-256 hash of the session token, never the token itself.
type StoredSession struct {
	ID         string    `json:"id"`
	Username   string    `json:"username"`
	Role       string    `json:"role"`
	DeviceName string    `json:"deviceName"`
	IPAddress  string    `json:"ipAddress"`
	CreatedAt  time.Time `json:"createdAt"`
	LastUsedAt time.Time `json:"lastUsedAt"`
}

type AuthConfig struct {
	AdminHash string                    `json:"admin_hash"`
	Sessions  map[string]*StoredSession `json:"session_records,omitempty"`

	// LegacySessions is read-only input for migrating files written before
	// tokens were hashed; it is never populated on save.
	LegacySessions map[string]*User `json:"sessions,omitempty"`
}

type FileAuthStore struct {
	mu       sync.Mutex
	filePath string
}

func NewFileAuthStore(path string) *FileAuthStore {
	return &FileAuthStore{
		filePath: path,
	}
}

func (s *FileAuthStore) Load() (*AuthConfig, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}

	var config AuthConfig
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, err
	}

	return &config, nil
}

func (s *FileAuthStore) Save(config *AuthConfig) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(s.filePath), 0755); err != nil {
		return err
	}

	return os.WriteFile(s.filePath, data, authFilePermissions)
}
