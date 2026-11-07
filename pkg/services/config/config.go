package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

// Config holds the application configuration
type Config struct {
	Libraries   []string `json:"libraries"`
	SetupDone   bool     `json:"setupDone"`
	Theme       string   `json:"theme"`
	AccentColor string   `json:"accentColor"`
	// Advanced Settings
	AutoScan         bool                `json:"autoScan"`
	CheckUpdates     bool                `json:"checkUpdates"`
	UseSymlinks      bool                `json:"useSymlinks"` // Default true for efficiency
	DeleteToTrash    bool                `json:"deleteToTrash"`
	PublicAccess     bool                `json:"publicAccess"`
	ServerEnabled    bool                `json:"serverEnabled"`
	ServerPort       string              `json:"serverPort"`
	AuthPollInterval int                 `json:"authPollInterval"`
	// AllowRemotePasswordLogin lets non-loopback clients log in with the admin
	// password. Off by default for every config, including ones without the key.
	AllowRemotePasswordLogin bool `json:"allowRemotePasswordLogin"`
	// ServerBindAddress is "" or "all" (every interface), "loopback", or a local interface IP.
	ServerBindAddress string `json:"serverBindAddress"`
	// ServerAllowedHosts lists extra DNS names (no port) clients may use to reach
	// the server, beyond IP addresses, localhost and this machine's hostname.
	ServerAllowedHosts []string `json:"serverAllowedHosts"`
	LastSeenVersion string              `json:"lastSeenVersion"`
	UpdateChannel    string              `json:"updateChannel"` // "stable" (default) | "unstable"
	PrivacyMode      bool                `json:"privacyMode"`
	Keybinds         map[string][]string `json:"keybinds,omitempty"` // ID -> ["CTRL", "F"]

	// UI Preferences
	GridSize         int    `json:"gridSize"`
	SortMode         string `json:"sortMode"`
	ItemsPerPage     int    `json:"itemsPerPage"`
	CensorThumbnails bool   `json:"censorThumbnails"`
	BlurAmount       int    `json:"blurAmount"`
	HidePackageNames bool   `json:"hidePackageNames"`
	HideCreatorNames bool   `json:"hideCreatorNames"`
}

// DefaultServerPort is used when no port has been configured.
const DefaultServerPort = "18888"

// ListenPort is the configured server port, or DefaultServerPort when unset.
func (c *Config) ListenPort() string {
	if c.ServerPort == "" {
		return DefaultServerPort
	}
	return c.ServerPort
}

// Clone returns a copy that shares no slice or map with the original, so it is
// safe to read while the service keeps mutating its own state.
func (c *Config) Clone() *Config {
	clone := *c
	clone.Libraries = append([]string(nil), c.Libraries...)
	clone.ServerAllowedHosts = append([]string(nil), c.ServerAllowedHosts...)
	if c.Keybinds != nil {
		clone.Keybinds = make(map[string][]string, len(c.Keybinds))
		for action, keys := range c.Keybinds {
			clone.Keybinds[action] = append([]string(nil), keys...)
		}
	}
	return &clone
}

// ConfigService handles configuration persistence. Get and Load return
// snapshots: mutating one never changes the stored configuration, use Update.
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
			Libraries:        []string{},
			UseSymlinks:      true,  // Default
			DeleteToTrash:    true,  // Default
			PublicAccess:     false, // Default Private
			ServerPort:       DefaultServerPort,
			AuthPollInterval: 15,
			UpdateChannel:    "stable", // Default to the safe channel

			Keybinds:         make(map[string][]string),
			// UI Defaults
			GridSize:     160,
			SortMode:     "name-asc",
			ItemsPerPage: 25,
			BlurAmount:   10,
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
		return s.config.Clone(), err
	}

	err = json.Unmarshal(data, s.config)
	if err != nil {
		return s.config.Clone(), err
	}
	s.config.ServerBindAddress = normaliseBindAddress(s.config.ServerBindAddress)
	s.config.ServerAllowedHosts = normaliseAllowedHosts(s.config.ServerAllowedHosts)

	// Migration: existing users who configured libraries before the SetupWizard
	// existed will have setupDone=false. Treat a non-empty library list as implicit proof
	// of prior setup and silently migrate them to avoid the wizard appearing on update.
	if !s.config.SetupDone && len(s.config.Libraries) > 0 {
		s.config.SetupDone = true
		data, _ := json.MarshalIndent(s.config, "", "  ")
		_ = os.WriteFile(s.path, data, 0644) // Best-effort persist; non-fatal if it fails.
	}

	return s.config.Clone(), nil
}

func (s *fileConfigService) Save(cfg *Config) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.config = cfg.Clone()
	s.config.ServerBindAddress = normaliseBindAddress(s.config.ServerBindAddress)
	s.config.ServerAllowedHosts = normaliseAllowedHosts(s.config.ServerAllowedHosts)

	data, err := json.MarshalIndent(s.config, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(s.path, data, 0644)
}

func (s *fileConfigService) Get() *Config {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.config.Clone()
}

func (s *fileConfigService) IsConfigured() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.config.SetupDone
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

	// fn works on a copy that replaces the live configuration only once it is
	// on disk, so a failed write leaves memory and disk agreeing.
	updated := s.config.Clone()
	fn(updated)
	updated.ServerBindAddress = normaliseBindAddress(updated.ServerBindAddress)
	updated.ServerAllowedHosts = normaliseAllowedHosts(updated.ServerAllowedHosts)

	data, err := json.MarshalIndent(updated, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(s.path, data, 0644); err != nil {
		return err
	}
	s.config = updated
	return nil
}
