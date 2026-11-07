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

func TestDisableOldVersionsContinuesAfterFailure(t *testing.T) {
	lib := NewLibraryService(&MockSystemService{}, nil, nil)
	dir := t.TempDir()
	newest := filepath.Join(dir, "A.B.3.var")
	blocked := filepath.Join(dir, "A.B.2.var")
	older := filepath.Join(dir, "A.B.1.var")
	writeFile(t, newest, "3")
	writeFile(t, blocked, "2")
	writeFile(t, blocked+".disabled", "2-disabled")
	writeFile(t, older, "1")

	err := lib.DisableOldVersions("A", "B", dir)
	if !errors.Is(err, ErrCounterpartExists) {
		t.Fatalf("expected aggregated ErrCounterpartExists, got %v", err)
	}
	assertContent(t, newest, "3")
	assertContent(t, blocked, "2")
	assertContent(t, blocked+".disabled", "2-disabled")
	assertContent(t, older+".disabled", "1")
	if _, statErr := os.Stat(older); !os.IsNotExist(statErr) {
		t.Fatal("older version should have been disabled despite the earlier failure")
	}
}
