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

	return s.writeAtomically(data)
}

// writeAtomically replaces the auth file via a temp file in the same
// directory so a crash mid-write never leaves a truncated file behind.
func (s *FileAuthStore) writeAtomically(data []byte) (err error) {
	permissions := os.FileMode(authFilePermissions)
	if info, statErr := os.Stat(s.filePath); statErr == nil {
		permissions = info.Mode().Perm()
	}

	tempFile, err := os.CreateTemp(filepath.Dir(s.filePath), filepath.Base(s.filePath)+".*.tmp")
	if err != nil {
		return err
	}
	tempPath := tempFile.Name()
	defer func() {
		if err != nil {
			tempFile.Close()
			os.Remove(tempPath)
		}
	}()

	if err = tempFile.Chmod(permissions); err != nil {
		return err
	}
	if _, err = tempFile.Write(data); err != nil {
		return err
	}
	if err = tempFile.Sync(); err != nil {
		return err
	}
	if err = tempFile.Close(); err != nil {
		return err
	}
	return os.Rename(tempPath, s.filePath)
}
