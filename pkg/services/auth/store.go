package auth

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

type AuthConfig struct {
	AdminHash string `json:"admin_hash"`
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
			return nil, nil // Not found is not an error
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

	// Ensure dir exists
	dir := filepath.Dir(s.filePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	return os.WriteFile(s.filePath, data, 0644)
}
