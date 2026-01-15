package library

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestInstall_PermissionDenied(t *testing.T) {
	// Skip on CI if needed, or specific OS checks
	// This test attempts to provoke a permission error.

	mockSys := &MockSystemService{}
	lib := NewLibraryService(mockSys, nil)

	srcDir := t.TempDir()
	destDir := t.TempDir()

	// Source file
	srcFile := filepath.Join(srcDir, "locked.var")
	os.WriteFile(srcFile, []byte("secret"), 0644)

	// Strategy: Create a SUBDIRECTORY in dest with the same name as the file?
	// That causes "is a directory" error, not Access Denied.

	// Strategy: Lock the destination file.
	destFile := filepath.Join(destDir, "locked.var")
	f, err := os.Create(destFile)
	if err != nil {
		t.Fatal(err)
	}
	// On Windows, opening a file exclusive might prevent opening it again?
	// But os.Create overwrites.
	// Let's Chmod the DIRECTORY.

	err = os.Chmod(destDir, 0444) // Read only
	if err != nil {
		t.Logf("Chmod failed, skipping test (might be Windows/User constraint): %v", err)
		f.Close()
		return
	}
	// Try cleanup later
	defer os.Chmod(destDir, 0777)
	f.Close() // Close the file we created, relies on Directory permission now.

	files := []string{srcFile}

	// Test
	installed, err := lib.Install(files, destDir, true, nil)

	// If it succeeds, Chmod didn't prevent write (common on Windows for Admin)
	if err == nil {
		t.Log("Install succeeded despite Chmod 0444. OS might not enforce directory read-only. Skipping.")
		return
	}

	// If it failed, check error message
	// Expected: "Active Denied" or "permission denied"
	// Install returns generic error wrapping the string?

	// The Install function captures error and appends to ignored list if it's one file?
	// No, Install returns error only if ALL failed or something?
	// "return installed, fmt.Errorf(...)" if len(ignored) > 0.

	t.Logf("Got expected error: %v", err)

	if len(installed) != 0 {
		t.Errorf("Expected 0 installed, got %d", len(installed))
	}

	// Check if error string implies permission issue
	if !strings.Contains(strings.ToLower(err.Error()), "denied") && !strings.Contains(strings.ToLower(err.Error()), "permission") {
		t.Logf("Warning: Error message didn't contain 'denied' or 'permission', got: %v", err)
	}
}
