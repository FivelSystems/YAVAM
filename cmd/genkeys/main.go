package main

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"os"
)

func main() {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		panic(err)
	}

	pubB64 := base64.StdEncoding.EncodeToString(pub)
	privB64 := base64.StdEncoding.EncodeToString(priv)

	// Also hex for easier debugging/compatibility if needed
	pubHex := hex.EncodeToString(pub)

	fmt.Println("--- YAVAM Updater Key Generator ---")
	fmt.Println("1. PUBLIC KEY (Embed this in pkg/updater/keys.go):")
	fmt.Printf("var PublicKey = \"%s\"\n", pubB64)
	fmt.Println("(Hex: " + pubHex + ")")

	fmt.Println("\n2. PRIVATE KEY (Add this to GitHub Secrets as UPDATER_PRIVATE_KEY):")
	fmt.Println(privB64)

	// Write to files for safety
	os.WriteFile("update.pub", []byte(pubB64), 0644)
	os.WriteFile("update.key", []byte(privB64), 0600)
	fmt.Println("\nKeys saved to 'update.pub' and 'update.key'. KEEP THE PRIVATE KEY SAFE!")
}
