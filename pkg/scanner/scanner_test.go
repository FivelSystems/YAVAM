package scanner

import (
	"os"
	"path/filepath"
	"testing"
)

func TestScanForPackages_RootError(t *testing.T) {
	s := NewScanner()

	// 1. Test Valid Path
	tmpDir, err := os.MkdirTemp("", "yavam_scan_test")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	_, err = s.ScanForPackages(tmpDir)
	if err != nil {
		t.Errorf("Expected nil error for valid path, got %v", err)
	}

	// 2. Test Invalid Path (should return error now)
	invalidPath := filepath.Join(tmpDir, "does_not_exist")
	_, err = s.ScanForPackages(invalidPath)
	if err == nil {
		t.Error("Expected error for non-existent path, got nil (Error was suppressed!)")
	} else {
		t.Logf("Got expected error: %v", err)
	}
}
