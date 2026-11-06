package manager

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"yavam/pkg/models"
	"yavam/pkg/services/config"
	"yavam/pkg/services/system"
)

type recordingSystemService struct {
	clipboardCopies int
	clipboardCuts   int
}

func (s *recordingSystemService) GetDiskSpace(string) (system.DiskSpaceInfo, error) {
	return system.DiskSpaceInfo{Free: 1 << 40, Total: 1 << 40, TotalFree: 1 << 40}, nil
}
func (s *recordingSystemService) OpenFolder(string) error      { return nil }
func (s *recordingSystemService) DeleteToTrash(string) error   { return nil }
func (s *recordingSystemService) GetFileDetails([]string) ([]models.FileDetail, error) {
	return nil, nil
}
func (s *recordingSystemService) CopyFilesToClipboard([]string) error {
	s.clipboardCopies++
	return nil
}
func (s *recordingSystemService) CutFileToClipboard(string) error {
	s.clipboardCuts++
	return nil
}

func newManagerWithLibrary(t *testing.T) (*Manager, *recordingSystemService, string, string) {
	t.Helper()
	root := t.TempDir()
	libraryDir := filepath.Join(root, "library")
	outsideDir := filepath.Join(root, "outside")
	for _, dir := range []string{libraryDir, outsideDir} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", dir, err)
		}
	}
	sys := &recordingSystemService{}
	cfgService := &MockConfigService{cfg: &config.Config{Libraries: []string{libraryDir}}}
	return NewManager(sys, nil, cfgService), sys, libraryDir, outsideDir
}

func TestCopyFilesToClipboardValidatesEveryPath(t *testing.T) {
	m, sys, libraryDir, outsideDir := newManagerWithLibrary(t)
	inside := filepath.Join(libraryDir, "a.var")
	outside := filepath.Join(outsideDir, "b.var")

	if err := m.CopyFilesToClipboard([]string{inside}); err != nil {
		t.Fatalf("valid path rejected: %v", err)
	}
	if sys.clipboardCopies != 1 {
		t.Fatalf("expected system service call, got %d", sys.clipboardCopies)
	}

	if err := m.CopyFilesToClipboard([]string{inside, outside}); err == nil {
		t.Fatal("expected rejection when one path is outside libraries")
	}
	if sys.clipboardCopies != 1 {
		t.Fatalf("system service called despite rejection: %d", sys.clipboardCopies)
	}
}

func TestCutFileToClipboardValidatesPath(t *testing.T) {
	m, sys, libraryDir, outsideDir := newManagerWithLibrary(t)

	if err := m.CutFileToClipboard(filepath.Join(libraryDir, "a.var")); err != nil {
		t.Fatalf("valid path rejected: %v", err)
	}
	if sys.clipboardCuts != 1 {
		t.Fatalf("expected system service call, got %d", sys.clipboardCuts)
	}

	if err := m.CutFileToClipboard(filepath.Join(outsideDir, "b.var")); err == nil {
		t.Fatal("expected rejection for path outside libraries")
	}
	if sys.clipboardCuts != 1 {
		t.Fatalf("system service called despite rejection: %d", sys.clipboardCuts)
	}
}

func TestDownloadPackageValidatesSourceOnly(t *testing.T) {
	m, _, libraryDir, outsideDir := newManagerWithLibrary(t)
	source := filepath.Join(libraryDir, "a.var")
	if err := os.WriteFile(source, []byte("payload"), 0o644); err != nil {
		t.Fatal(err)
	}
	foreign := filepath.Join(outsideDir, "b.var")
	if err := os.WriteFile(foreign, []byte("payload"), 0o644); err != nil {
		t.Fatal(err)
	}
	exportDir := t.TempDir()

	if err := m.DownloadPackage(source, exportDir); err != nil {
		t.Fatalf("library package to external destination failed: %v", err)
	}
	if _, err := os.Stat(filepath.Join(exportDir, "a.var")); err != nil {
		t.Fatalf("expected copied file: %v", err)
	}

	if err := m.DownloadPackage(foreign, exportDir); err == nil {
		t.Fatal("expected rejection for source outside libraries")
	}
	if _, err := os.Stat(filepath.Join(exportDir, "b.var")); !os.IsNotExist(err) {
		t.Fatal("rejected source must not be copied")
	}
}

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
		// if wd is C:\Users\USER\github\yavam
		// lib1 is C:\Users\USER\github\yavam
		// other is C:\Users\USER\github\yavam\other_folder -> This IS inside lib1!
		// Wait, previously server_security_test setup:
		// lib1 = strings.ToLower(wd)
		// test "Outside": wd + "_other". So C:\Users\USER\github\yavam_other.
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
