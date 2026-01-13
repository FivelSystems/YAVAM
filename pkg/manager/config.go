package manager

import (
	"fmt"
	"yavam/pkg/services/config"
)

// Legacy wrappers to maintain API compatibility during refactor.
// These now delegate to the injected ConfigService.

// GetLibraries returns the list of configured libraries
func (m *Manager) GetLibraries() []string {
	// Provide safe default if config service missing (e.g. tests)
	if m.config == nil {
		return []string{}
	}
	cfg := m.config.Get()
	if cfg == nil {
		return []string{}
	}

	// ConfigService.Get() returns *Config. We should copy if we want thread safety at this level?
	// ConfigService handles its own locking, but returns a pointer.
	// Copy to be safe from modifications.
	libs := make([]string, len(cfg.Libraries))
	copy(libs, cfg.Libraries)
	return libs
}

// SetLibraries updates the library list and saves config
func (m *Manager) SetLibraries(libs []string) error {
	if m.config == nil {
		return fmt.Errorf("config service not initialized")
	}
	return m.config.Update(func(c *config.Config) {
		c.Libraries = libs
	})
}

// AddLibrary adds a library path if not exists
func (m *Manager) AddLibrary(path string) error {
	if m.config == nil {
		return fmt.Errorf("config service not initialized")
	}

	// We need to check existence inside the Update/Lock to be atomic?
	// Or check first? ConfigService.Update locks.
	return m.config.Update(func(c *config.Config) {
		for _, l := range c.Libraries {
			if l == path {
				return // Already exists, logic handling? Update doesn't return error from specific logic easily.
			}
		}
		c.Libraries = append(c.Libraries, path)
	})
}

// RemoveLibrary removes a library path
func (m *Manager) RemoveLibrary(path string) error {
	if m.config == nil {
		return fmt.Errorf("config service not initialized")
	}
	return m.config.Update(func(c *config.Config) {
		newLibs := []string{}
		for _, l := range c.Libraries {
			if l != path {
				newLibs = append(newLibs, l)
			}
		}
		c.Libraries = newLibs
	})
}

// These methods were previously on *Manager in config.go or implicit?
// We need to match whatever App expects.
// App calls: GetLibraries, AddLibrary, RemoveLibrary, SetLibraries.
// We covered those.

// LoadConfig/SaveConfig were called internally or by App?
// App doesn't call them directly usually, Manager did.
// Manager.NewManager called LoadConfig. Now ConfigService loads itself.
