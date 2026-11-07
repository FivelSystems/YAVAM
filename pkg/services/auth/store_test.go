package auth

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func listTempLeftovers(t *testing.T, dir string) []string {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("read dir: %v", err)
	}
	var leftovers []string
	for _, entry := range entries {
		if strings.HasSuffix(entry.Name(), ".tmp") {
			leftovers = append(leftovers, entry.Name())
		}
	}
	return leftovers
}

func TestSaveLeavesNoTempFiles(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "auth.json")
	store := NewFileAuthStore(path)

	for i := 0; i < 3; i++ {
		if err := store.Save(&AuthConfig{AdminHash: "hash"}); err != nil {
			t.Fatalf("save: %v", err)
		}
	}

	if leftovers := listTempLeftovers(t, dir); len(leftovers) != 0 {
		t.Errorf("unexpected temp files: %v", leftovers)
	}
	loaded, err := store.Load()
	if err != nil || loaded == nil || loaded.AdminHash != "hash" {
		t.Fatalf("load after save: %v %+v", err, loaded)
	}
}

func TestSavePreservesExistingPermissions(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("POSIX permission bits are not meaningful on Windows")
	}
	path := filepath.Join(t.TempDir(), "auth.json")
	if err := os.WriteFile(path, []byte("{}"), 0640); err != nil {
		t.Fatal(err)
	}

	if err := NewFileAuthStore(path).Save(&AuthConfig{AdminHash: "hash"}); err != nil {
		t.Fatalf("save: %v", err)
	}

	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0640 {
		t.Errorf("permissions = %v, want 0640", info.Mode().Perm())
	}
}

func TestSaveNewFileUsesDefaultPermissions(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("POSIX permission bits are not meaningful on Windows")
	}
	path := filepath.Join(t.TempDir(), "auth.json")
	if err := NewFileAuthStore(path).Save(&AuthConfig{AdminHash: "hash"}); err != nil {
		t.Fatalf("save: %v", err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != authFilePermissions {
		t.Errorf("permissions = %v, want %v", info.Mode().Perm(), os.FileMode(authFilePermissions))
	}
}

func TestSaveCleansUpTempFileOnFailure(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "auth.json")
	// A directory at the target path makes the final rename fail.
	if err := os.Mkdir(path, 0755); err != nil {
		t.Fatal(err)
	}

	if err := NewFileAuthStore(path).Save(&AuthConfig{AdminHash: "hash"}); err == nil {
		t.Fatal("expected save to fail")
	}

	if leftovers := listTempLeftovers(t, dir); len(leftovers) != 0 {
		t.Errorf("temp files not cleaned up: %v", leftovers)
	}
}
