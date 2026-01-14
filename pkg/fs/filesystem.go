package fs

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"unsafe"
)

// FileSystem interface allows us to mock OS interactions for testing
type FileSystem interface {
	// DeleteToTrash moves a file to the system trash/recycle bin
	DeleteToTrash(path string) error
	// OpenFolder opens the file explorer at the given path
	OpenFolder(path string) error
	// Stat returns file info (wrapper around os.Stat usually)
	Stat(path string) (interface{}, error)
	// GetDiskFreeSpace returns free, total, and totalFree bytes for a path
	GetDiskFreeSpace(path string) (uint64, uint64, uint64, error)
}

// WindowsFileSystem implements FileSystem using native Windows APIs
type WindowsFileSystem struct{}

var (
	modShell32           = syscall.NewLazyDLL("shell32.dll")
	procSHFileOperationW = modShell32.NewProc("SHFileOperationW")
)

const (
	FO_DELETE          = 0x0003
	FOF_ALLOWUNDO      = 0x0040
	FOF_NOCONFIRMATION = 0x0010 // Don't ask user "Are you sure?"
	FOF_SILENT         = 0x0004 // Don't show progress dialog
	FOF_NOERRORUI      = 0x0400 // Don't show error UI
)

// SHFILEOPSTRUCT for SHFileOperationW
// IMPORTANT: Fields must align with C struct on x64 (8-byte alignment)
// BOOL is 4 bytes.
// Pointers are 8 bytes.
type SHFILEOPSTRUCT struct {
	Hwnd syscall.Handle // 8 bytes
	Func uint32         // 4 bytes
	// Padding 4 bytes implicit
	From  *uint16 // 8 bytes
	To    *uint16 // 8 bytes
	Flags uint16  // 2 bytes
	// Padding 2 bytes implicit? No, alignment rules.
	// Actually, just using int32 for BOOL (4 bytes) and letting Go align it usually works,
	// but manual padding ensures we match the C struct memory layout exactly.
	Aborted   int32   // 4 bytes (BOOL)
	HNameMaps uintptr // 8 bytes
	Title     *uint16 // 8 bytes
}

func (w *WindowsFileSystem) DeleteToTrash(path string) error {
	absPath, err := filepath.Abs(path)
	if err != nil {
		return fmt.Errorf("failed to get absolute path: %v", err)
	}

	// Double-null termination logic for SHFileOperation
	// syscall.UTF16FromString returns []uint16 with a single null terminator.
	// We append a second null terminator explicitly.
	chars, err := syscall.UTF16FromString(absPath)
	if err != nil {
		return err
	}
	chars = append(chars, 0) // Second null terminator

	fileOp := &SHFILEOPSTRUCT{
		Hwnd:    0,
		Func:    FO_DELETE,
		From:    &chars[0],
		To:      nil,
		Flags:   FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_SILENT | FOF_NOERRORUI,
		Aborted: 0,
		Title:   nil,
	}

	ret, _, _ := procSHFileOperationW.Call(uintptr(unsafe.Pointer(fileOp)))
	if ret != 0 {
		return fmt.Errorf("SHFileOperationW failed with error code: %d", ret)
	}

	return nil
}

func (w *WindowsFileSystem) OpenFolder(path string) error {
	// If it's a directory, open INSIDE it.
	info, err := os.Stat(path)
	if err == nil && info.IsDir() {
		return exec.Command("explorer", path).Start()
	}

	// Otherwise, select the file in its parent
	cmd := exec.Command("explorer", "/select,", path)
	return cmd.Start()
}

func (w *WindowsFileSystem) Stat(path string) (interface{}, error) {
	return nil, nil // Wrapper
}
