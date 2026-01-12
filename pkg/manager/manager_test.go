package manager

import (
	"testing"
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
	m := NewManager(mockFS)

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
