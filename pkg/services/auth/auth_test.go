package auth

import (
	"path/filepath"
	"testing"
)

func TestLoginFlow(t *testing.T) {
	tempDir := t.TempDir()
	configPath := filepath.Join(tempDir, "auth.json")

	svc, err := NewSimpleAuthService(configPath)
	if err != nil {
		t.Fatalf("Failed to create auth service: %v", err)
	}

	password := "secret"
	svc.SetPassword(password)

	// 1. Direct Login
	token, err := svc.Login("admin", password, "test-device")
	if err != nil {
		t.Fatalf("Login failed: %v", err)
	}
	if token == "" {
		t.Fatal("Expected token, got empty")
	}

	// 2. Validate Token
	user, err := svc.ValidateToken(token)
	if err != nil {
		t.Fatalf("ValidateToken failed: %v", err)
	}
	if user.Username != "admin" {
		t.Errorf("Expected admin, got %s", user.Username)
	}
}

func TestInvalidCredentials(t *testing.T) {
	tempDir := t.TempDir()
	configPath := filepath.Join(tempDir, "auth.json")

	svc, _ := NewSimpleAuthService(configPath)
	password := "secret"
	svc.SetPassword(password)

	// Invalid Pass
	_, err := svc.Login("admin", "wrongpasswd", "test-device")
	if err == nil {
		t.Fatal("Expected error on invalid password, got nil")
	}

	// Valid Pass
	_, err = svc.Login("admin", password, "test-device")
	if err != nil {
		t.Fatalf("Login failed with valid pass: %v", err)
	}
}

func TestUnknownUser(t *testing.T) {
	tempDir := t.TempDir()
	configPath := filepath.Join(tempDir, "auth.json")

	svc, _ := NewSimpleAuthService(configPath)
	// Try login with non-admin
	_, err := svc.Login("hacker", "whatever", "dev")
	if err == nil {
		t.Fatal("Expected error for unknown user")
	}
}

func TestPersistence(t *testing.T) {
	tempDir := t.TempDir()
	configPath := filepath.Join(tempDir, "auth.json")

	// 1. Create Service & Login
	svc1, _ := NewSimpleAuthService(configPath)
	svc1.SetPassword("secret")
	token, _ := svc1.Login("admin", "secret", "persist-device")

	// 2. Re-create Service (Simulate Restart)
	svc2, err := NewSimpleAuthService(configPath)
	if err != nil {
		t.Fatalf("Failed to restart service: %v", err)
	}

	// 3. Verify Session exists
	user, err := svc2.ValidateToken(token)
	if err != nil {
		t.Fatalf("Session lost after restart: %v", err)
	}
	if user.DeviceName != "persist-device" {
		t.Errorf("Expected device persist-device, got %s", user.DeviceName)
	}
	if user.Token != token {
		t.Errorf("User.Token not restored. Expected %s, got %s", token, user.Token)
	}
}

func TestRevocationPersistence(t *testing.T) {
	tempDir := t.TempDir()
	configPath := filepath.Join(tempDir, "auth.json")

	svc1, _ := NewSimpleAuthService(configPath)
	svc1.SetPassword("secret")

	// Login
	token, _ := svc1.Login("admin", "secret", "revoke-device")

	// Revoke
	svc1.RevokeToken(token)

	// Restart
	svc2, err := NewSimpleAuthService(configPath)
	if err != nil {
		t.Fatalf("Failed to restart service: %v", err)
	}

	// Verify Session is GONE
	_, err = svc2.ValidateToken(token)
	if err != ErrInvalidToken {
		t.Fatal("Session should remain revoked after restart")
	}
}
