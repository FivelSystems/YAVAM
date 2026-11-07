package manager

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func writeFile(t *testing.T, path string, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

func assertExists(t *testing.T, path string) {
	t.Helper()
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("expected %s to exist: %v", path, err)
	}
}

func assertMissing(t *testing.T, path string) {
	t.Helper()
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("expected %s to be absent (err=%v)", path, err)
	}
}

func TestTogglePackageValidatesPath(t *testing.T) {
	m, _, libraryDir, outsideDir := newManagerWithLibrary(t)
	inside := filepath.Join(libraryDir, "a.var")
	outside := filepath.Join(outsideDir, "b.var")
	writeFile(t, inside, "x")
	writeFile(t, outside, "x")

	newPath, err := m.TogglePackage(nil, inside, false, libraryDir, false)
	if err != nil {
		t.Fatalf("valid toggle failed: %v", err)
	}
	assertExists(t, newPath)
	assertMissing(t, inside)

	_, err = m.TogglePackage(nil, outside, false, libraryDir, false)
	if !errors.Is(err, ErrPathNotAllowed) {
		t.Fatalf("expected ErrPathNotAllowed, got %v", err)
	}
	assertExists(t, outside)
	assertMissing(t, outside+".disabled")
}

func TestCopyPackagesToLibraryValidatesSourcesAndDestination(t *testing.T) {
	m, _, libraryDir, outsideDir := newManagerWithLibrary(t)
	secondLibrary := filepath.Join(filepath.Dir(libraryDir), "library2")
	if err := os.MkdirAll(secondLibrary, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := m.AddLibrary(secondLibrary); err != nil {
		t.Fatal(err)
	}
	source := filepath.Join(libraryDir, "a.var")
	foreign := filepath.Join(outsideDir, "b.var")
	writeFile(t, source, "payload")
	writeFile(t, foreign, "payload")

	if _, err := m.CopyPackagesToLibrary([]string{source}, secondLibrary, true, nil); err != nil {
		t.Fatalf("valid copy failed: %v", err)
	}
	assertExists(t, filepath.Join(secondLibrary, "a.var"))

	if _, err := m.CopyPackagesToLibrary([]string{foreign}, secondLibrary, true, nil); !errors.Is(err, ErrPathNotAllowed) {
		t.Fatalf("expected source rejection, got %v", err)
	}
	assertMissing(t, filepath.Join(secondLibrary, "b.var"))

	if _, err := m.CopyPackagesToLibrary([]string{source}, outsideDir, true, nil); !errors.Is(err, ErrPathNotAllowed) {
		t.Fatalf("expected destination rejection, got %v", err)
	}
	assertMissing(t, filepath.Join(outsideDir, "a.var"))

	if _, err := m.CheckCollisions([]string{source}, outsideDir); !errors.Is(err, ErrPathNotAllowed) {
		t.Fatalf("expected destination rejection for collision check, got %v", err)
	}
}

func TestInstallPackageValidatesDestinationOnly(t *testing.T) {
	m, _, libraryDir, outsideDir := newManagerWithLibrary(t)
	dropped := filepath.Join(outsideDir, "dropped.var")
	writeFile(t, dropped, "payload")

	if _, err := m.InstallPackage([]string{dropped}, libraryDir, nil); err != nil {
		t.Fatalf("install into library failed: %v", err)
	}
	assertExists(t, filepath.Join(libraryDir, "dropped.var"))

	if _, err := m.InstallPackage([]string{dropped}, outsideDir, nil); !errors.Is(err, ErrPathNotAllowed) {
		t.Fatalf("expected destination rejection, got %v", err)
	}
}

func TestDeleteToTrashValidatesPath(t *testing.T) {
	m, _, libraryDir, outsideDir := newManagerWithLibrary(t)

	if err := m.DeleteToTrash(filepath.Join(libraryDir, "a.var")); err != nil {
		t.Fatalf("valid delete rejected: %v", err)
	}
	if err := m.DeleteToTrash(filepath.Join(outsideDir, "b.var")); !errors.Is(err, ErrPathNotAllowed) {
		t.Fatalf("expected ErrPathNotAllowed, got %v", err)
	}
}

func TestDisableOldVersionsValidatesInputs(t *testing.T) {
	m, _, libraryDir, outsideDir := newManagerWithLibrary(t)
	writeFile(t, filepath.Join(libraryDir, "Maker.Look.1.var"), "x")
	writeFile(t, filepath.Join(libraryDir, "Maker.Look.2.var"), "x")

	if err := m.DisableOldVersions(nil, "Maker", "Look", outsideDir); !errors.Is(err, ErrPathNotAllowed) {
		t.Fatalf("expected ErrPathNotAllowed, got %v", err)
	}
	if err := m.DisableOldVersions(nil, "..", "Look", libraryDir); err == nil {
		t.Fatal("expected rejection of malformed identifier")
	}
	assertMissing(t, filepath.Join(libraryDir, "Maker.Look.1.var.disabled"))

	if err := m.DisableOldVersions(nil, "Maker", "Look", libraryDir); err != nil {
		t.Fatalf("valid call failed: %v", err)
	}
	assertExists(t, filepath.Join(libraryDir, "Maker.Look.1.var.disabled"))
	assertExists(t, filepath.Join(libraryDir, "Maker.Look.2.var"))
}
