package config

import (
	"os"
	"testing"
)

func TestDefaultConfig(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "yavam_config_test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

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
}
