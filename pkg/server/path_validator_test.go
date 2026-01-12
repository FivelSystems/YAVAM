package server

import (
	"os"
	"path/filepath"
	"testing"
)

func TestIsSafePath(t *testing.T) {
	// Setup a temporary directory for testing
	tmpDir, err := os.MkdirTemp("", "yavam_safe_test")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	// Create a subdirectory "library"
	libraryPath := filepath.Join(tmpDir, "library")
	os.Mkdir(libraryPath, 0755)

	// Create a file inside "library"
	goodFile := filepath.Join(libraryPath, "good.txt")
	os.WriteFile(goodFile, []byte("ok"), 0644)

	// Create a file outside "library" (in strict root)
	secretFile := filepath.Join(tmpDir, "secret.txt")
	os.WriteFile(secretFile, []byte("shh"), 0644)

	s := &Server{}

	tests := []struct {
		name     string
		root     string
		path     string
		wantSafe bool
	}{
		{
			name:     "Valid file inside library",
			root:     libraryPath,
			path:     goodFile,
			wantSafe: true,
		},
		{
			name:     "Valid file via symlink traversal (.. in path)",
			root:     libraryPath,
			path:     filepath.Join(libraryPath, "..", "library", "good.txt"),
			wantSafe: true, // filepath.Abs resolves this
		},
		{
			name:     "Attack: Parent directory",
			root:     libraryPath,
			path:     filepath.Join(libraryPath, "..", "secret.txt"),
			wantSafe: false,
		},
		{
			name:     "Attack: Absolute path to separate logic",
			root:     libraryPath,
			path:     secretFile,
			wantSafe: false,
		},
		{
			name:     "Attack: Root of drive",
			root:     libraryPath,
			path:     "C:\\Windows\\System32\\drivers\\etc\\hosts",
			wantSafe: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := s.isSafePath(tt.path, tt.root)
			if got != tt.wantSafe {
				t.Errorf("isSafePath(%q, %q) = %v, want %v", tt.path, tt.root, got, tt.wantSafe)
			}
		})
	}
}
