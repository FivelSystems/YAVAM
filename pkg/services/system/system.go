package system

import (
	"fmt"
	"os/exec"
	"yavam/pkg/fs"
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
	// Use PowerShell to set the clipboard (Works on Windows 10/11)
	// Set-Clipboard -Path conflicts with string input, so we use pipe or LiteralPath
	cmd := exec.Command("powershell", "-NoProfile", "-Command", fmt.Sprintf("Set-Clipboard -LiteralPath '%s'", path))
	return cmd.Run()
}

func (s *defaultSystemService) CutFileToClipboard(path string) error {
	return nil
}
