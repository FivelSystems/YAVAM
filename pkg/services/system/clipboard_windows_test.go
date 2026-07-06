//go:build windows

package system

import (
	"syscall"
	"testing"
	"unsafe"
)

var (
	procGetClipboardData = modUser32.NewProc("GetClipboardData")
	procDragQueryFileW   = syscall.NewLazyDLL("shell32.dll").NewProc("DragQueryFileW")
)

// readClipboardFiles reads the CF_HDROP drop list back off the clipboard so a
// test can confirm setClipboardFiles wrote what Explorer would.
func readClipboardFiles(t *testing.T) []string {
	t.Helper()

	if ok, _, err := procOpenClipboard.Call(0); ok == 0 {
		t.Fatalf("OpenClipboard failed: %v", err)
	}
	defer procCloseClipboard.Call()

	hDrop, _, _ := procGetClipboardData.Call(cfHDROP)
	if hDrop == 0 {
		t.Fatal("no CF_HDROP data on clipboard")
	}

	count, _, _ := procDragQueryFileW.Call(hDrop, 0xFFFFFFFF, 0, 0)
	var files []string
	for i := uintptr(0); i < count; i++ {
		buf := make([]uint16, syscall.MAX_PATH)
		procDragQueryFileW.Call(hDrop, i, uintptr(unsafe.Pointer(&buf[0])), uintptr(len(buf)))
		files = append(files, syscall.UTF16ToString(buf))
	}
	return files
}

func TestSetClipboardFilesRoundTrip(t *testing.T) {
	want := []string{`C:\temp\alpha.var`, `C:\temp\beta and space.var`}

	if err := setClipboardFiles(want); err != nil {
		t.Fatalf("setClipboardFiles failed: %v", err)
	}

	got := readClipboardFiles(t)
	if len(got) != len(want) {
		t.Fatalf("got %d files, want %d: %v", len(got), len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("file %d = %q, want %q", i, got[i], want[i])
		}
	}
}

func TestSetClipboardFilesEmpty(t *testing.T) {
	if err := setClipboardFiles(nil); err != nil {
		t.Fatalf("empty path list should be a no-op, got: %v", err)
	}
}
