package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

// Config holds the application configuration
type Config struct {
	VamPath     string   `json:"vamPath"`
	Libraries   []string `json:"libraries"`
	SetupDone   bool     `json:"setupDone"`
	Theme       string   `json:"theme"`
	AccentColor string   `json:"accentColor"`
	// Advanced Settings
	AutoScan      bool `json:"autoScan"`
	CheckUpdates  bool `json:"checkUpdates"`
	UseSymlinks   bool `json:"useSymlinks"` // Default true for efficiency
	DeleteToTrash bool `json:"deleteToTrash"`
	PublicAccess  bool `json:"publicAccess"`
	ServerEnabled bool `json:"serverEnabled"`
}

// ConfigService handles configuration persistence
type ConfigService interface {
	Load() (*Config, error)
	Save(cfg *Config) error
	Get() *Config
	IsConfigured() bool
	FinishSetup() error
	Update(func(*Config)) error
}

type fileConfigService struct {
	path   string
	config *Config
	mu     sync.RWMutex
}

func NewFileConfigService(configDir string) (ConfigService, error) {
	configPath := filepath.Join(configDir, "config.json")
	svc := &fileConfigService{
		path: configPath,
		config: &Config{
			Libraries:     []string{},
			UseSymlinks:   true,  // Default
			DeleteToTrash: true,  // Default
			PublicAccess:  false, // Default Private
		},
	}
	// Attempt load
	svc.Load()
	return svc, nil
}

func (s *fileConfigService) Load() (*Config, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.path)
	if err != nil {
		// If not exists, return default (already set)
		return s.config, err
	}

	err = json.Unmarshal(data, s.config)
	return s.config, err
}

func (s *fileConfigService) Save(cfg *Config) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Update internal state
	s.config = cfg

	data, err := json.MarshalIndent(s.config, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(s.path, data, 0644)
}

func (s *fileConfigService) Get() *Config {
	s.mu.RLock()
	defer s.mu.RUnlock()
	// Return copy? Or pointer? Pointer for now to match current behavior,
	// but careful about concurrency.
	return s.config
}

func (s *fileConfigService) IsConfigured() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.config.SetupDone && s.config.VamPath != ""
}

func (s *fileConfigService) FinishSetup() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.config.SetupDone = true
	// Internal save to persist
	data, err := json.MarshalIndent(s.config, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, data, 0644)
}

func (s *fileConfigService) Update(fn func(*Config)) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	fn(s.config)

	data, err := json.MarshalIndent(s.config, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, data, 0644)
}
