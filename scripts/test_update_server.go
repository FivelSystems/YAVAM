package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
)

// Config
const (
	Port           = "8090"
	StableVersion  = "v9.9.9"                          // served on /releases/latest
	NightlyVersion = "v9.9.10-unstable.20260704.abc123" // newest on /releases
	MockChangelog  = "## Test Update\n\nThis is a mock update served from localhost."
	ExecutableName = "yavam.exe"
)

// release builds a GitHub-style release object pointing at the local download.
func release(tag string, prerelease bool) map[string]interface{} {
	return map[string]interface{}{
		"tag_name":   tag,
		"body":       MockChangelog,
		"prerelease": prerelease,
		"draft":      false,
		"assets": []map[string]interface{}{
			{
				"name":                 ExecutableName,
				"browser_download_url": fmt.Sprintf("http://localhost:%s/download/%s", Port, ExecutableName),
			},
		},
	}
}

func main() {
	// 1. Locate the .exe to serve (assume we are run from project root, look in build/bin or current dir)
	exePath := filepath.Join("build", "bin", ExecutableName)
	if _, err := os.Stat(exePath); os.IsNotExist(err) {
		// Fallback to searching in current dir
		exePath = ExecutableName
		if _, err := os.Stat(exePath); os.IsNotExist(err) {
			log.Fatalf("Could not find %s to serve as the 'new' version. Please run 'wails build' first.", ExecutableName)
		}
	}
	fmt.Printf("[Server] Serving update binary from: %s\n", exePath)

	// 2. Setup Handlers — mirror the two GitHub endpoints the updater uses.

	// STABLE channel → newest non-prerelease.
	http.HandleFunc("/releases/latest", func(w http.ResponseWriter, r *http.Request) {
		fmt.Println("[Request] /releases/latest (stable) - Sending stable release...")
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(release(StableVersion, false))
	})

	// UNSTABLE channel → full list incl. prereleases; updater picks newest by semver.
	http.HandleFunc("/releases", func(w http.ResponseWriter, r *http.Request) {
		fmt.Println("[Request] /releases (unstable) - Sending release list...")
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]map[string]interface{}{
			release(NightlyVersion, true),
			release(StableVersion, false),
		})
	})

	http.HandleFunc("/download/", func(w http.ResponseWriter, r *http.Request) {
		fmt.Println("[Request] /download - Sending binary...")
		// Serve the file
		f, err := os.Open(exePath)
		if err != nil {
			http.Error(w, "File not found", 404)
			return
		}
		defer f.Close()

		// Set headers
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s", ExecutableName))
		w.Header().Set("Content-Type", "application/octet-stream")

		io.Copy(w, f)
	})

	// 3. Start
	fmt.Printf("\n=== Update Mock Server Running ===\n")
	fmt.Printf("1. Open a new terminal.\n")
	fmt.Printf("2. Set environment variable (the API BASE, no trailing path):\n")
	fmt.Printf("   pwsh: $env:YAVAM_UPDATE_URL = 'http://localhost:%s'\n", Port)
	fmt.Printf("   cmd:  set YAVAM_UPDATE_URL=http://localhost:%s\n", Port)
	fmt.Printf("3. Run the built application: .\\build\\bin\\yavam.exe\n")
	fmt.Printf("   - Stable channel  -> resolves %s\n", StableVersion)
	fmt.Printf("   - Unstable channel -> resolves %s\n", NightlyVersion)
	fmt.Printf("==================================\n\n")

	log.Fatal(http.ListenAndServe(":"+Port, nil))
}
