package fs

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"
)

// FileSystem interface allows us to mock OS interactions for testing
type FileSystem interface {
	// DeleteToTrash moves a file to the system trash/recycle bin.
	// Returns ErrFileNotFound (check with errors.Is) if the file no longer
	// exists at the given path, and ErrUnsafeRecycleBinVolume if the path is
	// on a volume where Windows does not maintain a recycle bin (deleting
	// there would be permanent, silently, if attempted anyway).
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

	modKernel32       = syscall.NewLazyDLL("kernel32.dll")
	procGetDriveTypeW = modKernel32.NewProc("GetDriveTypeW")
)

const (
	FO_DELETE          = 0x0003
	FOF_ALLOWUNDO      = 0x0040
	FOF_NOCONFIRMATION = 0x0010 // Don't ask user "Are you sure?"
	FOF_SILENT         = 0x0004 // Don't show progress dialog
	FOF_NOERRORUI      = 0x0400 // Don't show error UI
)

// GetDriveTypeW return values (winbase.h)
const (
	DRIVE_UNKNOWN     = 0
	DRIVE_NO_ROOT_DIR = 1
	DRIVE_REMOVABLE   = 2
	DRIVE_FIXED       = 3
	DRIVE_REMOTE      = 4
	DRIVE_CDROM       = 5
	DRIVE_RAMDISK     = 6
)

// ErrFileNotFound is returned by DeleteToTrash when the target file (and, for
// .var packages, its .var.disabled counterpart) no longer exists on disk.
// Callers must not count this as a successful trash operation.
var ErrFileNotFound = errors.New("file not found")

// ErrUnsafeRecycleBinVolume is returned by DeleteToTrash when the target path
// lives on a volume (network/UNC share or removable media) where Windows
// does not maintain a recycle bin. Forcing SHFileOperationW with
// FOF_ALLOWUNDO there deletes the file permanently without any warning, so
// DeleteToTrash refuses rather than attempting the operation.
var ErrUnsafeRecycleBinVolume = errors.New("recycle bin unavailable on this volume")

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

	if isUnsafeRecycleBinDriveType(getDriveType(absPath)) {
		return fmt.Errorf("%w: %s", ErrUnsafeRecycleBinVolume, absPath)
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
		// SHFileOperationW error code 2/3 = file or path not found.
		// The package may have been toggled (.var ↔ .var.disabled) since the
		// caller last read its path. Probe the alternate path and delete it
		// if found; only treat as success if neither path exists.
		if ret == 2 || ret == 3 {
			altPath := toggledPath(absPath)
			if altPath != "" {
				if _, statErr := os.Stat(altPath); statErr == nil {
					// File exists at the alternate path — delete that instead.
					return w.DeleteToTrash(altPath)
				}
			}
			// Neither path exists — the caller must not count this as a
			// trash operation that actually freed space.
			return fmt.Errorf("%w: %s", ErrFileNotFound, absPath)
		}
		return fmt.Errorf("SHFileOperationW failed with error code: %d", ret)
	}

	return nil
}

// toggledPath returns the .var.disabled counterpart of a .var path, or vice versa.
// Returns empty string if the path does not match either extension.
func toggledPath(path string) string {
	lower := strings.ToLower(path)
	switch {
	case strings.HasSuffix(lower, ".var"):
		return path + ".disabled"
	case strings.HasSuffix(lower, ".var.disabled"):
		return path[:len(path)-len(".disabled")]
	}
	return ""
}

// getDriveType resolves the Windows drive type (DRIVE_FIXED, DRIVE_REMOTE,
// etc.) of the volume containing path. Returns DRIVE_UNKNOWN if the volume
// cannot be determined, so callers should not treat DRIVE_UNKNOWN as unsafe.
func getDriveType(path string) uint32 {
	root := filepath.VolumeName(path)
	if root == "" {
		return DRIVE_UNKNOWN
	}
	if !strings.HasSuffix(root, `\`) {
		root += `\`
	}

	rootPtr, err := syscall.UTF16PtrFromString(root)
	if err != nil {
		return DRIVE_UNKNOWN
	}

	ret, _, _ := procGetDriveTypeW.Call(uintptr(unsafe.Pointer(rootPtr)))
	return uint32(ret)
}

// isUnsafeRecycleBinDriveType reports whether driveType identifies a volume
// where Windows does not maintain a recycle bin: network shares (DRIVE_REMOTE)
// and removable media (DRIVE_REMOVABLE, e.g. USB drives, SD cards).
func isUnsafeRecycleBinDriveType(driveType uint32) bool {
	return driveType == DRIVE_REMOTE || driveType == DRIVE_REMOVABLE
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
