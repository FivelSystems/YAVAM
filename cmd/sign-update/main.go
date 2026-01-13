package main

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"os"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Usage: sign-update <file-to-sign>")
		os.Exit(1)
	}

	filePath := os.Args[1]
	privKeyB64 := os.Getenv("UPDATER_PRIVATE_KEY")
	if privKeyB64 == "" {
		fmt.Println("Error: UPDATER_PRIVATE_KEY environment variable not set")
		os.Exit(1)
	}

	// Decode Private Key
	privKey, err := base64.StdEncoding.DecodeString(privKeyB64)
	if err != nil {
		fmt.Printf("Error decoding private key: %v\n", err)
		os.Exit(1)
	}
	if len(privKey) != ed25519.PrivateKeySize {
		fmt.Printf("Invalid private key size: %d\n", len(privKey))
		os.Exit(1)
	}

	// Read File
	data, err := os.ReadFile(filePath)
	if err != nil {
		fmt.Printf("Error reading file: %v\n", err)
		os.Exit(1)
	}

	// Hash File (Optional, but verifying whole file vs hash? Ed25519 usually signs message.
	// To match pkg/updater/verifier checking 'data', we should sign 'data'.
	// BUT reading 50MB into memory?
	// Security Best Practice: Sign the HASH of the file.
	// Let's check `pkg/updater/keys.go`/verifier.
	// VerifySignature takes 'data []byte'. It verifies data directly.
	// If VerifySignature passes the whole binary content, that's heavy.
	// Let's check VerifySignature implementation.
	// `ed25519.Verify` takes the message.

	// Refactoring VerifySignature to use HASH prevents DOS/Memory issues.
	// I will update this tool to sign the SHA256 sum.
	// AND I must update verifier.go to verify hash of file.

	// Wait, standard practice for `minisign` is usually signature of the file content.
	// For Go's ed25519, `Sign` signs the message.
	// If the file is huge, this is bad.
	// Let's switch to signing the SHA256 Checksum.

	hash := sha256.Sum256(data)
	signature := ed25519.Sign(privKey, hash[:])

	sigB64 := base64.StdEncoding.EncodeToString(signature)

	// Write signature to file
	sigPath := filePath + ".sig"
	if err := os.WriteFile(sigPath, []byte(sigB64), 0644); err != nil {
		fmt.Printf("Error writing signature: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Signed %s -> %s\n", filePath, sigPath)
}
