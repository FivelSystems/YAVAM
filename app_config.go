package main

import (
	"yavam/pkg/services/config"
)

// SaveKeybinds persists keybind overrides to config.json
func (a *App) SaveKeybinds(overrides map[string][]string) error {
	return a.manager.UpdateConfig(func(cfg *config.Config) {
		cfg.Keybinds = overrides
	})
}

// SetPrivacyMode updates the global privacy mode
func (a *App) SetPrivacyMode(enabled bool) error {
	return a.manager.UpdateConfig(func(cfg *config.Config) {
		cfg.PrivacyMode = enabled
	})
}
