package auth

import (
	"crypto/sha256"
	"encoding/hex"
	"path/filepath"
	"testing"
)

func TestChallengeResponseFlow(t *testing.T) {
	tempDir := t.TempDir()
	configPath := filepath.Join(tempDir, "auth.json")

	svc, err := NewSimpleAuthService(configPath)
	if err != nil {
		t.Fatalf("Failed to create auth service: %v", err)
	}

	password := "secret"
	svc.SetPassword(password)

	// 1. Initiate Login
	nonce, err := svc.InitiateLogin("admin")
	if err != nil {
		t.Fatalf("InitiateLogin failed: %v", err)
	}
	if nonce == "" {
		t.Fatal("Expected nonce, got empty")
	}

	// 2. Calculate Proof (Client Side Logic)
	// H1 = SHA256(password)
	h1 := sha256.Sum256([]byte(password))
	h1Str := hex.EncodeToString(h1[:])

	// Proof = SHA256(H1 + Nonce)
	proofRaw := sha256.Sum256([]byte(h1Str + nonce))
	proof := hex.EncodeToString(proofRaw[:])

	// 3. Complete Login
	token, err := svc.CompleteLogin("admin", nonce, proof, "test-device")
	if err != nil {
		t.Fatalf("CompleteLogin failed: %v", err)
	}
	if token == "" {
		t.Fatal("Expected token, got empty")
	}

	// 4. Validate Token
	user, err := svc.ValidateToken(token)
	if err != nil {
		t.Fatalf("ValidateToken failed: %v", err)
	}
	if user.Username != "admin" {
		t.Errorf("Expected admin, got %s", user.Username)
	}
}

func TestReplayAttack(t *testing.T) {
	tempDir := t.TempDir()
	configPath := filepath.Join(tempDir, "auth.json")

	svc, _ := NewSimpleAuthService(configPath)
	password := "secret"
	svc.SetPassword(password)

	nonce, _ := svc.InitiateLogin("admin")

	h1 := sha256.Sum256([]byte(password))
	h1Str := hex.EncodeToString(h1[:])
	proofRaw := sha256.Sum256([]byte(h1Str + nonce))
	proof := hex.EncodeToString(proofRaw[:])

	// First Login (Success)
	_, err := svc.CompleteLogin("admin", nonce, proof, "test-device")
	if err != nil {
		t.Fatalf("First login failed: %v", err)
	}

	// Replay (Fail)
	_, err = svc.CompleteLogin("admin", nonce, proof, "test-device")
	if err == nil {
		t.Fatal("Expected error on replay attack, got nil")
	}
}

func TestInvalidProof(t *testing.T) {
	tempDir := t.TempDir()
	configPath := filepath.Join(tempDir, "auth.json")

	svc, _ := NewSimpleAuthService(configPath)
	svc.SetPassword("secret")
	nonce, _ := svc.InitiateLogin("admin")

	_, err := svc.CompleteLogin("admin", nonce, "badproof", "test-device")
	if err == nil {
		t.Fatal("Expected error for invalid proof")
	}
}

func TestUnknownUser(t *testing.T) {
	tempDir := t.TempDir()
	configPath := filepath.Join(tempDir, "auth.json")

	svc, _ := NewSimpleAuthService(configPath)
	_, err := svc.InitiateLogin("hacker")
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
	nonce, _ := svc1.InitiateLogin("admin")

	h1 := sha256.Sum256([]byte("secret"))
	h1Str := hex.EncodeToString(h1[:])
	proofRaw := sha256.Sum256([]byte(h1Str + nonce))
	proof := hex.EncodeToString(proofRaw[:])

	token, _ := svc1.CompleteLogin("admin", nonce, proof, "persist-device")

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
	nonce, _ := svc1.InitiateLogin("admin")
	h1 := sha256.Sum256([]byte("secret"))
	h1Str := hex.EncodeToString(h1[:])
	proofRaw := sha256.Sum256([]byte(h1Str + nonce))
	proof := hex.EncodeToString(proofRaw[:])
	token, _ := svc1.CompleteLogin("admin", nonce, proof, "revoke-device")

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
