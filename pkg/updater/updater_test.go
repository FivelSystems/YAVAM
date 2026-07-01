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

	// 2. Set Env Var to point to Mock Server (treated as the API base)
	os.Setenv("YAVAM_UPDATE_URL", ts.URL)
	defer os.Unsetenv("YAVAM_UPDATE_URL")

	// 3. Test
	info, err := GetLatestVersion("v1.0.0", ChannelStable)
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

// TestGetLatestVersion_UnstableChannel verifies that the unstable channel reads
// the full /releases list and picks the newest build by semver, including
// prereleases.
func TestGetLatestVersion_UnstableChannel(t *testing.T) {
	mux := http.NewServeMux()
	// Stable "latest" is an older release.
	mux.HandleFunc("/releases/latest", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(Release{
			TagName: "v1.3.19",
			Assets:  exeAsset(),
		})
	})
	// Full list has stable + two unstable prereleases; newest date should win.
	mux.HandleFunc("/releases", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode([]Release{
			{TagName: "v1.3.19", Assets: exeAsset()},
			{TagName: "v1.4.0-unstable.20260627.aaaaaaa", Prerelease: true, Assets: exeAsset()},
			{TagName: "v1.4.0-unstable.20260704.bbbbbbb", Prerelease: true, Assets: exeAsset()},
		})
	})
	ts := httptest.NewServer(mux)
	defer ts.Close()

	os.Setenv("YAVAM_UPDATE_URL", ts.URL)
	defer os.Unsetenv("YAVAM_UPDATE_URL")

	info, err := GetLatestVersion("v1.3.19", ChannelUnstable)
	if err != nil {
		t.Fatalf("unstable check failed: %v", err)
	}
	if info == nil {
		t.Fatal("expected an unstable update, got nil")
	}
	if info.Version != "v1.4.0-unstable.20260704.bbbbbbb" {
		t.Errorf("expected newest unstable build, got %s", info.Version)
	}
}

// TestGetChannelHead_Downgrade verifies that switching to stable resolves to the
// stable head even when it is a LOWER version than what is installed.
func TestGetChannelHead_Downgrade(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/releases/latest", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(Release{TagName: "v1.3.19", Assets: exeAsset()})
	})
	ts := httptest.NewServer(mux)
	defer ts.Close()

	os.Setenv("YAVAM_UPDATE_URL", ts.URL)
	defer os.Unsetenv("YAVAM_UPDATE_URL")

	// Running an unstable build; stable head is older but must still be returned.
	head, err := GetChannelHead(ChannelStable)
	if err != nil {
		t.Fatalf("channel head failed: %v", err)
	}
	if head == nil || head.Version != "v1.3.19" {
		t.Fatalf("expected stable head v1.3.19, got %+v", head)
	}
}

func TestCompareVersions(t *testing.T) {
	cases := []struct {
		a, b string
		want int
	}{
		{"1.4.0", "1.3.19", 1},
		{"1.3.19", "1.4.0", -1},
		{"1.4.0", "1.4.0", 0},
		// Pre-release ranks below its final release.
		{"1.4.0", "1.4.0-unstable.5", 1},
		{"1.4.0-unstable.5", "1.4.0", -1},
		// Two unstable builds ordered by their identifiers (the old bug: these
		// used to compare equal).
		{"1.4.0-unstable.20260704.aaa", "1.4.0-unstable.20260627.bbb", 1},
		{"1.4.0-unstable.20260627.bbb", "1.4.0-unstable.20260704.aaa", -1},
		{"1.4.0-unstable.20260704.aaa", "1.4.0-unstable.20260704.aaa", 0},
		// Numeric identifiers compare numerically, not lexically.
		{"1.4.0-unstable.10", "1.4.0-unstable.9", 1},
		// Build metadata is ignored.
		{"1.4.0+build.7", "1.4.0", 0},
	}
	for _, c := range cases {
		if got := compareVersions(c.a, c.b); got != c.want {
			t.Errorf("compareVersions(%q, %q) = %d, want %d", c.a, c.b, got, c.want)
		}
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

// exeAsset builds the single-.exe asset slice used by mock releases.
func exeAsset() []struct {
	Name               string `json:"name"`
	BrowserDownloadUrl string `json:"browser_download_url"`
} {
	return []struct {
		Name               string `json:"name"`
		BrowserDownloadUrl string `json:"browser_download_url"`
	}{
		{Name: "yavam.exe", BrowserDownloadUrl: "http://example.com/yavam.exe"},
	}
}
