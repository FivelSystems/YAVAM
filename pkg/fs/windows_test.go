//go:build windows

package fs

import (
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
