package fs

import (
	"syscall"
	"unsafe"
)

func (w *WindowsFileSystem) GetDiskFreeSpace(path string) (uint64, uint64, uint64, error) {
	var freeBytes, totalBytes, totalFreeBytes uint64

	pathPtr, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return 0, 0, 0, err
	}

	// We need to load kernel32 for this
	modKernel32 := syscall.NewLazyDLL("kernel32.dll")
	procGetDiskFreeSpaceExW := modKernel32.NewProc("GetDiskFreeSpaceExW")

	ret, _, err := procGetDiskFreeSpaceExW.Call(
		uintptr(unsafe.Pointer(pathPtr)),
		uintptr(unsafe.Pointer(&freeBytes)),
		uintptr(unsafe.Pointer(&totalBytes)),
		uintptr(unsafe.Pointer(&totalFreeBytes)),
	)

	if ret == 0 {
		return 0, 0, 0, err
	}

	return freeBytes, totalBytes, totalFreeBytes, nil
}
