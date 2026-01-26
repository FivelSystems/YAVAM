package manager

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"yavam/pkg/services/config"
)

func TestValidatePath(t *testing.T) {
	wd, _ := os.Getwd()
	lib1 := strings.ToLower(filepath.Clean(wd))
	lib2 := strings.ToLower(filepath.Clean(filepath.Join(wd, "lib2")))

	cfg := &config.Config{
		Libraries: []string{lib1, lib2},
	}
	mockCfg := &MockConfigService{cfg: cfg}

	// Create Manager with Mock Config
	// We pass nil for system/library services as ValidatePath only relies on Config
	m := NewManager(nil, nil, mockCfg)

	tests := []struct {
		name    string
		path    string
		wantErr bool
	}{
		{"Exact Active", lib1, false},
		{"Sub Active", filepath.Join(lib1, "Sub"), false},
		{"Exact Lib2", lib2, false},
		{"Sub Lib2", filepath.Join(lib2, "File.txt"), false},
		{"Outside", filepath.Join(filepath.Dir(lib1), "other_folder"), true},
		// if wd is C:\Users\ganndev\github\yavam
		// lib1 is C:\Users\ganndev\github\yavam
		// other is C:\Users\ganndev\github\yavam\other_folder -> This IS inside lib1!
		// Wait, previously server_security_test setup:
		// lib1 = strings.ToLower(wd)
		// test "Outside": wd + "_other". So C:\Users\ganndev\github\yavam_other.
		// That is technically outside.
		// Let's replicate exact strings if possible, or build robust paths.

		{"Outside Suffix", lib1 + "_suffix", true}, // e.g. /foo/bar vs /foo/bar_suffix
		{"Empty", "", true},
		{"Partial Match", filepath.Join(filepath.Dir(lib1), "FolderWithPrefix"), true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := m.ValidatePath(tt.path)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidatePath(%q) error = %v, wantErr %v", tt.path, err, tt.wantErr)
			}
		})
	}
}
