package manager

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

type Config struct {
	Libraries []string `json:"libraries"`
}

// ConfigFile is the name of the configuration file
const ConfigFile = "config.json"

// LoadConfig loads the configuration from disk
func (m *Manager) LoadConfig() error {
	path := filepath.Join(m.DataPath, ConfigFile)

	// Default config
	m.mu.Lock()
	m.config = &Config{
		Libraries: []string{},
	}
	m.mu.Unlock()

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil // Use defaults
		}
		return err
	}

	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return err
	}

	m.mu.Lock()
	m.config = &cfg
	m.mu.Unlock()
	return nil
}

// SaveConfig writes the configuration to disk
func (m *Manager) SaveConfig() error {
	m.mu.Lock()
	cfg := m.config
	m.mu.Unlock()

	if cfg == nil {
		return nil
	}

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}

	path := filepath.Join(m.DataPath, ConfigFile)
	return os.WriteFile(path, data, 0644)
}

// GetLibraries returns the list of configured libraries
func (m *Manager) GetLibraries() []string {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.config == nil {
		return []string{}
	}
	// Return copy
	libs := make([]string, len(m.config.Libraries))
	copy(libs, m.config.Libraries)
	return libs
}

// SetLibraries updates the library list and saves config
func (m *Manager) SetLibraries(libs []string) error {
	m.mu.Lock()
	if m.config == nil {
		m.config = &Config{}
	}
	m.config.Libraries = libs
	m.mu.Unlock()
	return m.SaveConfig()
}

// AddLibrary adds a library path if not exists
func (m *Manager) AddLibrary(path string) error {
	m.mu.Lock()
	// Check existence
	for _, l := range m.config.Libraries {
		if l == path {
			m.mu.Unlock()
			return fmt.Errorf("library already exists")
		}
	}
	m.config.Libraries = append(m.config.Libraries, path)
	m.mu.Unlock()
	return m.SaveConfig()
}

// RemoveLibrary removes a library path
func (m *Manager) RemoveLibrary(path string) error {
	m.mu.Lock()
	newLibs := []string{}
	for _, l := range m.config.Libraries {
		if l != path {
			newLibs = append(newLibs, l)
		}
	}
	m.config.Libraries = newLibs
	m.mu.Unlock()
	return m.SaveConfig()
}
