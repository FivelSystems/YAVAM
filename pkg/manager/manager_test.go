package manager

import (
	"testing"
	"varmanager/pkg/services/system"
)

// MockFileSystem for testing
type MockFileSystem struct {
	DeletedFiles  []string
	OpenedFolders []string
}

func (m *MockFileSystem) DeleteToTrash(path string) error {
	m.DeletedFiles = append(m.DeletedFiles, path)
	return nil
}

func (m *MockFileSystem) OpenFolder(path string) error {
	m.OpenedFolders = append(m.OpenedFolders, path)
	return nil
}

func (m *MockFileSystem) Stat(path string) (interface{}, error) {
	return nil, nil // Always exists
}

func (m *MockFileSystem) GetDiskFreeSpace(path string) (uint64, uint64, uint64, error) {
	return 1000, 2000, 1000, nil // Mock values
}

func TestDeleteToTrash_CallsFileSystem(t *testing.T) {
	mockFS := &MockFileSystem{}
	sys := system.NewSystemService(mockFS)
	// We pass nil for config as we aren't testing it here, or simplistic mock?
	// NewManager handles nil config gracefully? In new code it assigns it.
	// We might need a dummy config service if NewManager requires it.
	// NewManager implementation: m.config = cfg.
	// If method uses it, it might panic.
	// TestDeleteToTrash doesn't use config.

	// Create manager with mock system, default library (which uses mock system if passed?), nil config
	// Since we are testing Manager logic that delegates, we might want a Mock Library too?
	// Or use real library with mock system.
	// For now, passing nil for library will create default library using the mock system.
	m := NewManager(sys, nil, nil)

	testPath := "C:\\test\\file.var"
	err := m.DeleteToTrash(testPath)

	if err != nil {
		t.Errorf("DeleteToTrash returned error: %v", err)
	}

	if len(mockFS.DeletedFiles) != 1 {
		t.Errorf("Expected 1 deleted file, got %d", len(mockFS.DeletedFiles))
	}

	if mockFS.DeletedFiles[0] != testPath {
		t.Errorf("Expected deleted path %s, got %s", testPath, mockFS.DeletedFiles[0])
	}
}
