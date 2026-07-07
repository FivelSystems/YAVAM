package system

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"runtime"
	"syscall"
	"unsafe"
)

var (
	modUser32   = syscall.NewLazyDLL("user32.dll")
	modKernel32 = syscall.NewLazyDLL("kernel32.dll")

	procOpenClipboard    = modUser32.NewProc("OpenClipboard")
	procEmptyClipboard   = modUser32.NewProc("EmptyClipboard")
	procSetClipboardData = modUser32.NewProc("SetClipboardData")
	procCloseClipboard   = modUser32.NewProc("CloseClipboard")

	procGlobalAlloc   = modKernel32.NewProc("GlobalAlloc")
	procGlobalLock    = modKernel32.NewProc("GlobalLock")
	procGlobalUnlock  = modKernel32.NewProc("GlobalUnlock")
	procGlobalFree    = modKernel32.NewProc("GlobalFree")
	procRtlMoveMemory = modKernel32.NewProc("RtlMoveMemory")
)

const (
	cfHDROP = 15

	gmemMoveable = 0x0002
	gmemZeroInit = 0x0040
)

// dropfiles mirrors the Win32 DROPFILES structure that prefixes a CF_HDROP
// payload. pFiles is the byte offset from the start of the struct to the file
// list; fWide marks the list as UTF-16.
type dropfiles struct {
	pFiles uint32
	ptX    int32
	ptY    int32
	fNC    int32
	fWide  int32
}

// setClipboardFiles places the given file paths on the Windows clipboard as a
// CF_HDROP drop list — the same format Explorer produces on Copy — so a paste
// into any file manager reproduces the files. It talks to the Win32 clipboard
// APIs directly to avoid spawning a console process.
func setClipboardFiles(paths []string) error {
	if len(paths) == 0 {
		return nil
	}

	payload, err := encodeDropFiles(paths)
	if err != nil {
		return err
	}

	hMem, _, _ := procGlobalAlloc.Call(gmemMoveable|gmemZeroInit, uintptr(len(payload)))
	if hMem == 0 {
		return fmt.Errorf("GlobalAlloc failed")
	}

	locked, _, _ := procGlobalLock.Call(hMem)
	if locked == 0 {
		procGlobalFree.Call(hMem)
		return fmt.Errorf("GlobalLock failed")
	}
	procRtlMoveMemory.Call(locked, uintptr(unsafe.Pointer(&payload[0])), uintptr(len(payload)))
	runtime.KeepAlive(payload)
	procGlobalUnlock.Call(hMem)

	if ok, _, err := procOpenClipboard.Call(0); ok == 0 {
		procGlobalFree.Call(hMem)
		return fmt.Errorf("OpenClipboard failed: %w", err)
	}

	// From here the clipboard is open; every return path must close it.
	procEmptyClipboard.Call()

	if ok, _, err := procSetClipboardData.Call(cfHDROP, hMem); ok == 0 {
		// Ownership of hMem only transfers to the OS on success; free it here.
		procGlobalFree.Call(hMem)
		procCloseClipboard.Call()
		return fmt.Errorf("SetClipboardData failed: %w", err)
	}

	procCloseClipboard.Call()
	return nil
}

// encodeDropFiles serialises the DROPFILES header followed by the paths as a
// double-null-terminated UTF-16 list: each path is null-terminated and the whole
// list ends with an extra null.
func encodeDropFiles(paths []string) ([]byte, error) {
	var list []uint16
	for _, p := range paths {
		encoded, err := syscall.UTF16FromString(p)
		if err != nil {
			return nil, fmt.Errorf("invalid path %q: %w", p, err)
		}
		list = append(list, encoded...) // encoded already carries its null terminator
	}
	list = append(list, 0)

	buf := new(bytes.Buffer)
	header := dropfiles{pFiles: uint32(unsafe.Sizeof(dropfiles{})), fWide: 1}
	if err := binary.Write(buf, binary.LittleEndian, &header); err != nil {
		return nil, err
	}
	if err := binary.Write(buf, binary.LittleEndian, list); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
