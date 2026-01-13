package auth

import (
	"crypto/sha256"
	"encoding/hex"
	"testing"
)

func TestChallengeResponseFlow(t *testing.T) {
	password := "secret"
	svc := NewSimpleAuthService(password)

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
	token, err := svc.CompleteLogin("admin", nonce, proof)
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
	password := "secret"
	svc := NewSimpleAuthService(password)

	nonce, _ := svc.InitiateLogin("admin")

	h1 := sha256.Sum256([]byte(password))
	h1Str := hex.EncodeToString(h1[:])
	proofRaw := sha256.Sum256([]byte(h1Str + nonce))
	proof := hex.EncodeToString(proofRaw[:])

	// First Login (Success)
	_, err := svc.CompleteLogin("admin", nonce, proof)
	if err != nil {
		t.Fatalf("First login failed: %v", err)
	}

	// Replay (Fail)
	_, err = svc.CompleteLogin("admin", nonce, proof)
	if err == nil {
		t.Fatal("Expected error on replay attack, got nil")
	}
}

func TestInvalidProof(t *testing.T) {
	svc := NewSimpleAuthService("secret")
	nonce, _ := svc.InitiateLogin("admin")

	_, err := svc.CompleteLogin("admin", nonce, "badproof")
	if err == nil {
		t.Fatal("Expected error for invalid proof")
	}
}

func TestUnknownUser(t *testing.T) {
	svc := NewSimpleAuthService("secret")
	_, err := svc.InitiateLogin("hacker")
	if err == nil {
		t.Fatal("Expected error for unknown user")
	}
}
