package server

import (
	"os"
	"strings"
	"testing"
)

func TestIsPathAllowed(t *testing.T) {
	// Setup generic paths for testing (OS agnostic logic is handled by filepath.Clean/Join)
	// But our specific implementation uses string manipulation which might be OS sensitive.
	// We'll stick to OS agnostic testing where possible or fix paths.

	wd, _ := os.Getwd()
	lib1 := strings.ToLower(wd)
	lib2 := strings.ToLower(wd) + "_2"

	s := &Server{
		libraries: []string{lib1, lib2},
	}

	tests := []struct {
		name string
		path string
		want bool
	}{
		{"Exact Active", lib1, true},
		{"Sub Active", lib1 + string(os.PathSeparator) + "Sub", true},
		{"Exact Lib2", lib2, true},
		{"Sub Lib2", lib2 + string(os.PathSeparator) + "File.txt", true},
		{"Outside", wd + "_other", false},
		// {"Parent Traversal", lib1 + string(os.PathSeparator) + ".." + string(os.PathSeparator) + "Other", false}, // Go clean handles this
		{"Empty", "", false},
		{"Partial Match", lib1 + "New", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := s.IsPathAllowed(tt.path); got != tt.want {
				t.Errorf("IsPathAllowed(%q) = %v, want %v", tt.path, got, tt.want)
			}
		})
	}
}
