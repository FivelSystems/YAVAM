package updater

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestGetLatestVersion_Integration(t *testing.T) {
	// 1. Setup Mock Server
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rel := Release{
			TagName: "v2.0.0",
			Body:    "Integration Test Release",
			Assets: []struct {
				Name               string `json:"name"`
				BrowserDownloadUrl string `json:"browser_download_url"`
			}{
				{Name: "app.exe", BrowserDownloadUrl: "http://example.com/app.exe"},
			},
		}
		json.NewEncoder(w).Encode(rel)
	}))
	defer ts.Close()

	// 2. Set Env Var to point to Mock Server
	os.Setenv("YAVAM_UPDATE_URL", ts.URL)
	defer os.Unsetenv("YAVAM_UPDATE_URL")

	// 3. Test
	info, err := GetLatestVersion("v1.0.0")
	if err != nil {
		t.Fatalf("Failed to check update: %v", err)
	}

	if info == nil {
		t.Fatal("Expected update, got nil")
	}

	if info.Version != "v2.0.0" {
		t.Errorf("Expected v2.0.0, got %s", info.Version)
	}
}

func TestApplyUpdate_Integration(t *testing.T) {
	// 1. Create a dummy executable
	tmpDir := t.TempDir()
	exePath := filepath.Join(tmpDir, "myapp.exe")

	err := os.WriteFile(exePath, []byte("old content"), 0755)
	if err != nil {
		t.Fatal(err)
	}

	// 2. Setup Mock Server to serve "new" binary
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("new content"))
	}))
	defer ts.Close()

	// 3. Call applyUpdateTo (using the mock URL)
	// Note: We use the unexported function for testing!
	// Wait, applyUpdateTo is unexported (lowercase).
	// But we are in package `updater`, so we can call it.

	err = applyUpdateTo(ts.URL, exePath)
	if err != nil {
		t.Fatalf("applyUpdateTo failed: %v", err)
	}

	// 4. Verify Rename Logic

	// Current exe should be "new content"
	content, _ := os.ReadFile(exePath)
	if string(content) != "new content" {
		t.Errorf("Executable was not updated. Content: %s", string(content))
	}

	// .old file should exist and be "old content"
	oldExePath := filepath.Join(tmpDir, "myapp.exe.old")
	oldContent, err := os.ReadFile(oldExePath)
	if err != nil {
		t.Errorf("Old executable backup not found: %v", err)
	}
	if string(oldContent) != "old content" {
		t.Errorf("Old executable backup content mismatch. Content: %s", string(oldContent))
	}

	// .new file should be gone
	if _, err := os.Stat(exePath + ".new"); !os.IsNotExist(err) {
		t.Error(".new file was not cleaned up (renamed)")
	}
}
