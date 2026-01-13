package library

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"yavam/pkg/services/system"
)

// MockSystemService for testing LibraryService
type MockSystemService struct {
	system.SystemService // Embed interface to skip implementing everything if not needed? No, must implement.
	// We can't embed interface if we want to mock specific methods without panic on others unless we impl all.
	// Copilot suggests struct.
}

func (m *MockSystemService) GetDiskSpace(path string) (system.DiskSpaceInfo, error) {
	return system.DiskSpaceInfo{
		Free:      1000000,
		Total:     2000000,
		TotalFree: 1000000,
	}, nil
}

func (m *MockSystemService) OpenFolder(path string) error {
	return nil
}

func (m *MockSystemService) DeleteToTrash(path string) error {
	return nil
}

func (m *MockSystemService) CopyFileToClipboard(path string) error {
	return nil
}

func (m *MockSystemService) CutFileToClipboard(path string) error {
	return nil
}

func TestInstall(t *testing.T) {
	mockSys := &MockSystemService{}
	lib := NewLibraryService(mockSys, nil)

	// Setup Temp Dirs
	srcDir := t.TempDir()
	destDir := t.TempDir()

	// Create dummy source file
	srcFile := filepath.Join(srcDir, "test.var")
	if err := os.WriteFile(srcFile, []byte("content"), 0644); err != nil {
		t.Fatal(err)
	}

	files := []string{srcFile}

	// Test Install
	installed, err := lib.Install(files, destDir, false, nil)
	if err != nil {
		t.Fatalf("Install failed: %v", err)
	}

	if len(installed) != 1 {
		t.Errorf("Expected 1 installed file, got %d", len(installed))
	}

	destFile := filepath.Join(destDir, "test.var")
	if _, err := os.Stat(destFile); os.IsNotExist(err) {
		t.Errorf("Destination file not created: %s", destFile)
	}
}

func TestInstall_Collision(t *testing.T) {
	mockSys := &MockSystemService{}
	lib := NewLibraryService(mockSys, nil)

	srcDir := t.TempDir()
	destDir := t.TempDir()

	srcFile := filepath.Join(srcDir, "collision.var")
	os.WriteFile(srcFile, []byte("A"), 0644)

	// Create existing file in dest
	destFile := filepath.Join(destDir, "collision.var")
	os.WriteFile(destFile, []byte("B"), 0644)

	files := []string{srcFile}

	// Test Install with overwrite=false
	installed, err := lib.Install(files, destDir, false, nil)
	// Install returns error if ignored/skipped?
	// Yes: "the following files were ignored..."
	if err == nil {
		t.Error("Expected error due to collision skipping, got nil")
	}
	if len(installed) != 0 {
		t.Errorf("Expected 0 installed files, got %d", len(installed))
	}

	// Test Install with overwrite=true
	installed, err = lib.Install(files, destDir, true, nil)
	if err != nil {
		t.Errorf("Install with overwrite=true failed: %v", err)
	}
	if len(installed) != 1 {
		t.Errorf("Expected 1 installed file, got %d", len(installed))
	}

	// Verify content overwritten
	content, _ := os.ReadFile(destFile)
	if string(content) != "A" {
		t.Errorf("Expected content 'A', got '%s'", string(content))
	}
}

func TestToggle(t *testing.T) {
	mockSys := &MockSystemService{}
	lib := NewLibraryService(mockSys, nil)

	tmpDir := t.TempDir()
	pkgPath := filepath.Join(tmpDir, "package.var")
	os.WriteFile(pkgPath, []byte("data"), 0644)

	// Disable
	newPath, err := lib.Toggle(pkgPath, false)
	if err != nil {
		t.Fatalf("Toggle disable failed: %v", err)
	}
	if !strings.HasSuffix(newPath, ".var.disabled") {
		t.Errorf("Expected .disabled suffix, got %s", newPath)
	}
	if _, err := os.Stat(newPath); os.IsNotExist(err) {
		t.Error("Disabled file does not exist")
	}

	// Enable
	origPath, err := lib.Toggle(newPath, true)
	if err != nil {
		t.Fatalf("Toggle enable failed: %v", err)
	}
	if strings.HasSuffix(origPath, ".disabled") {
		t.Errorf("Expected no .disabled suffix, got %s", origPath)
	}
	if _, err := os.Stat(origPath); os.IsNotExist(err) {
		t.Error("Enabled file does not exist")
	}
}

func TestCheckCollisions(t *testing.T) {
	mockSys := &MockSystemService{}
	lib := NewLibraryService(mockSys, nil)

	srcDir := t.TempDir()
	destDir := t.TempDir()

	srcFile := filepath.Join(srcDir, "chk.var")
	os.WriteFile(srcFile, []byte("data"), 0644)

	// Case 1: No collision
	cols, err := lib.CheckCollisions([]string{srcFile}, destDir)
	if err != nil {
		t.Fatalf("CheckCollisions failed: %v", err)
	}
	if len(cols) != 0 {
		t.Errorf("Expected 0 collisions, got %d", len(cols))
	}

	// Case 2: Collision
	destFile := filepath.Join(destDir, "chk.var")
	os.WriteFile(destFile, []byte("data"), 0644)

	cols, err = lib.CheckCollisions([]string{srcFile}, destDir)
	if err != nil {
		t.Fatalf("CheckCollisions failed: %v", err)
	}
	if len(cols) != 1 {
		t.Errorf("Expected 1 collision, got %d", len(cols))
	}
	if cols[0] != "chk.var" {
		t.Errorf("Expected collision 'chk.var', got %s", cols[0])
	}
}
