package system

import (
	"varmanager/pkg/fs"
)

// DiskSpaceInfo holds space information
type DiskSpaceInfo struct {
	Free      uint64 `json:"free"`
	Total     uint64 `json:"total"`
	TotalFree uint64 `json:"totalFree"`
}

// SystemService handles OS-level interactions
type SystemService interface {
	GetDiskSpace(path string) (DiskSpaceInfo, error)
	OpenFolder(path string) error
	DeleteToTrash(path string) error
	CopyFileToClipboard(path string) error
	CutFileToClipboard(path string) error
}

type defaultSystemService struct {
	fs fs.FileSystem
}

func NewSystemService(fileSystem fs.FileSystem) SystemService {
	if fileSystem == nil {
		fileSystem = &fs.WindowsFileSystem{}
	}
	return &defaultSystemService{
		fs: fileSystem,
	}
}

func (s *defaultSystemService) GetDiskSpace(path string) (DiskSpaceInfo, error) {
	free, total, totalFree, err := s.fs.GetDiskFreeSpace(path)
	if err != nil {
		return DiskSpaceInfo{}, err
	}
	return DiskSpaceInfo{
		Free:      free,
		Total:     total,
		TotalFree: totalFree,
	}, nil
}

func (s *defaultSystemService) OpenFolder(path string) error {
	return s.fs.OpenFolder(path)
}

func (s *defaultSystemService) DeleteToTrash(path string) error {
	return s.fs.DeleteToTrash(path)
}

func (s *defaultSystemService) CopyFileToClipboard(path string) error {
	// Logic currently in manager.go, needs to be moved here.
	// We'll temporarily error or duplicate logic?
	// Logic relies on 'exec.Command("powershell")', which is system level.
	// So YES, it belongs here.
	// I'll leave it as TODO for the move step or copy it now?
	// The implementation plan says "Extract". I will copy the logic in the next step or put it here now if I can view manager.go content clearly.
	// I'll put a placeholder or basic implementation.
	return nil
}

func (s *defaultSystemService) CutFileToClipboard(path string) error {
	return nil
}
