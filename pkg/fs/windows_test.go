//go:build windows

package fs

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestWindowsDeleteToTrash(t *testing.T) {
	// 1. Create a dummy file
	tmpDir := os.TempDir()
	file := filepath.Join(tmpDir, "yavam_delete_test.txt")
	err := os.WriteFile(file, []byte("test data"), 0644)
	if err != nil {
		t.Skipf("Could not create temp file: %v", err)
	}

	// 2. Try to delete it
	fs := &WindowsFileSystem{}
	err = fs.DeleteToTrash(file)

	if err != nil {
		t.Fatalf("DeleteToTrash failed: %v", err)
	}

	// 3. Verify it is gone from disk (moved to recycle bin)
	if _, err := os.Stat(file); err == nil {
		t.Errorf("File still exists after DeleteToTrash")
	} else if !os.IsNotExist(err) {
		t.Errorf("Unexpected error checking file existence: %v", err)
	}
}

func TestWindowsDeleteToTrashReturnsErrFileNotFound(t *testing.T) {
	tmpDir := t.TempDir()
	missing := filepath.Join(tmpDir, "does_not_exist.var")

	fs := &WindowsFileSystem{}
	err := fs.DeleteToTrash(missing)

	if err == nil {
		t.Fatal("expected ErrFileNotFound for a path that was never created, got nil")
	}
	if !errors.Is(err, ErrFileNotFound) {
		t.Errorf("expected errors.Is(err, ErrFileNotFound) to be true, got: %v", err)
	}
}

func TestWindowsDeleteToTrashFixedVolumeIsNotUnsafe(t *testing.T) {
	// os.TempDir() is on a local fixed drive in the test environment, so
	// DeleteToTrash must not refuse it as an unsafe recycle bin volume.
	tmpDir := os.TempDir()
	file := filepath.Join(tmpDir, "yavam_delete_safe_volume_test.txt")
	if err := os.WriteFile(file, []byte("test data"), 0644); err != nil {
		t.Skipf("Could not create temp file: %v", err)
	}

	fs := &WindowsFileSystem{}
	err := fs.DeleteToTrash(file)

	if errors.Is(err, ErrUnsafeRecycleBinVolume) {
		t.Fatalf("expected a local fixed drive not to be flagged as unsafe, got: %v", err)
	}
	if err != nil {
		t.Fatalf("DeleteToTrash failed: %v", err)
	}
}

func TestIsUnsafeRecycleBinDriveType(t *testing.T) {
	cases := []struct {
		name       string
		driveType  uint32
		wantUnsafe bool
	}{
		{"fixed", DRIVE_FIXED, false},
		{"unknown", DRIVE_UNKNOWN, false},
		{"no root dir", DRIVE_NO_ROOT_DIR, false},
		{"cdrom", DRIVE_CDROM, false},
		{"ramdisk", DRIVE_RAMDISK, false},
		{"removable", DRIVE_REMOVABLE, true},
		{"remote/network", DRIVE_REMOTE, true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := isUnsafeRecycleBinDriveType(tc.driveType); got != tc.wantUnsafe {
				t.Errorf("isUnsafeRecycleBinDriveType(%d) = %v, want %v", tc.driveType, got, tc.wantUnsafe)
			}
		})
	}
}

func TestGetDriveTypeLocalFixedVolume(t *testing.T) {
	tmpDir := os.TempDir()
	driveType := getDriveType(tmpDir)
	if driveType != DRIVE_FIXED {
		t.Errorf("expected os.TempDir() to resolve to DRIVE_FIXED, got %d", driveType)
	}
}
