package library

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func assertContent(t *testing.T, path, want string) {
	t.Helper()
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	if string(got) != want {
		t.Fatalf("%s content = %q, want %q", path, got, want)
	}
}

func TestToggleRefusesWhenCounterpartExists(t *testing.T) {
	lib := NewLibraryService(&MockSystemService{}, nil, nil)
	dir := t.TempDir()
	enabled := filepath.Join(dir, "A.B.1.var")
	disabled := enabled + ".disabled"
	writeFile(t, enabled, "enabled-bytes")
	writeFile(t, disabled, "disabled-bytes")

	for _, enable := range []bool{false, true} {
		source := enabled
		if enable {
			source = disabled
		}
		if _, err := lib.Toggle(source, enable); !errors.Is(err, ErrCounterpartExists) {
			t.Fatalf("enable=%v: expected ErrCounterpartExists, got %v", enable, err)
		}
		assertContent(t, enabled, "enabled-bytes")
		assertContent(t, disabled, "disabled-bytes")
	}
}
