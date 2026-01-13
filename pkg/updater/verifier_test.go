package updater

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"testing"
)

func TestVerifySignature(t *testing.T) {
	// 1. Generate a Test Keypair
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("Failed to generate test keys: %v", err)
	}

	// Override the global PublicKey for this test context
	// Note: In a real Scenario we might want to dependency inject the key, but swapping var is fine for simple test
	originalKey := PublicKey
	defer func() { PublicKey = originalKey }()

	PublicKey = base64.StdEncoding.EncodeToString(pub)

	// 2. Create Data and Sign it
	data := []byte("This is a trusted update binary")
	hash := sha256.Sum256(data)
	sig := ed25519.Sign(priv, hash[:])
	sigB64 := base64.StdEncoding.EncodeToString(sig)

	// 3. Test Valid
	if err := VerifySignature(data, sigB64); err != nil {
		t.Errorf("VerifySignature failed for valid signature: %v", err)
	}

	// 4. Test Tampered Data
	tamperedData := []byte("This is a MALICIOUS update binary")
	if err := VerifySignature(tamperedData, sigB64); err == nil {
		t.Error("VerifySignature SHOULD have failed for tampered data, but passed")
	}

	// 5. Test Invalid Signature
	if err := VerifySignature(data, "badsignaturebase64"); err == nil {
		t.Error("VerifySignature SHOULD have failed for invalid base64, but passed")
	}

	// 6. Test Wrong Key
	// Generate another keypair
	_, priv2, _ := ed25519.GenerateKey(rand.Reader)
	hash2 := sha256.Sum256(data)
	sig2 := ed25519.Sign(priv2, hash2[:])
	sigB64_2 := base64.StdEncoding.EncodeToString(sig2)

	// Should fail because PublicKey matches priv, not priv2
	if err := VerifySignature(data, sigB64_2); err == nil {
		t.Error("VerifySignature SHOULD have failed for wrong signing key, but passed")
	}
}
