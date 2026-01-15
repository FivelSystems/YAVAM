package config

import (
	"reflect"
	"testing"
)

func TestDefaultConfig(t *testing.T) {
	tmpDir := t.TempDir()
	svc, err := NewFileConfigService(tmpDir)
	if err != nil {
		t.Fatalf("Failed to create config service: %v", err)
	}

	cfg := svc.Get()

	if cfg.ServerPort != "18888" {
		t.Errorf("expected default ServerPort to be '18888', got '%s'", cfg.ServerPort)
	}
	if cfg.ServerEnabled {
		t.Errorf("expected default ServerEnabled to be false, got true")
	}
	if cfg.AuthPollInterval != 15 {
		t.Errorf("expected default AuthPollInterval to be 15, got %d", cfg.AuthPollInterval)
	}
	if cfg.LastSeenVersion != "" {
		t.Errorf("expected default LastSeenVersion to be empty, got '%s'", cfg.LastSeenVersion)
	}
}

func TestPersistence(t *testing.T) {
	tmpDir := t.TempDir()

	// 1. Create and Modify
	svc1, err := NewFileConfigService(tmpDir)
	if err != nil {
		t.Fatalf("Failed to create config service: %v", err)
	}

	err = svc1.Update(func(c *Config) {
		c.ServerPort = "9090"
		c.AuthPollInterval = 30
		c.LastSeenVersion = "v1.3.0"
		c.ServerEnabled = true
	})
	if err != nil {
		t.Fatalf("Update failed: %v", err)
	}

	// 2. Reload (Simulate Restart)
	svc2, err := NewFileConfigService(tmpDir)
	if err != nil {
		t.Fatalf("Failed to reload config service: %v", err)
	}

	cfg := svc2.Get()

	// 3. Verify
	if cfg.ServerPort != "9090" {
		t.Errorf("Persisted ServerPort mismatch. Got %s, want 9090", cfg.ServerPort)
	}
	if cfg.AuthPollInterval != 30 {
		t.Errorf("Persisted AuthPollInterval mismatch. Got %d, want 30", cfg.AuthPollInterval)
	}
	if cfg.LastSeenVersion != "v1.3.0" {
		t.Errorf("Persisted LastSeenVersion mismatch. Got %s, want v1.3.0", cfg.LastSeenVersion)
	}
	if !cfg.ServerEnabled {
		t.Errorf("Persisted ServerEnabled mismatch. Got false, want true")
	}
}

func TestKeybindPersistence(t *testing.T) {
	tmpDir := t.TempDir()

	// 1. Create and Modify
	svc1, err := NewFileConfigService(tmpDir)
	if err != nil {
		t.Fatalf("Failed to create config service: %v", err)
	}

	overrides := map[string][]string{
		"toggle_sidebar": {"CTRL", "TAB"},
		"my_action":      {"SHIFT", "F1"},
	}

	err = svc1.Update(func(c *Config) {
		c.Keybinds = overrides
	})
	if err != nil {
		t.Fatalf("Update failed: %v", err)
	}

	// 2. Reload
	svc2, err := NewFileConfigService(tmpDir)
	if err != nil {
		t.Fatalf("Failed to reload config service: %v", err)
	}

	cfg := svc2.Get()

	// 3. Verify
	if !reflect.DeepEqual(cfg.Keybinds, overrides) {
		t.Errorf("Keybind persistence mismatch.\nGot: %v\nWant: %v", cfg.Keybinds, overrides)
	}
}
