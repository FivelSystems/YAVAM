package auth

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadRemovesOnlyStaleAuthTempFiles(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "auth.json")
	store := NewFileAuthStore(path)
	if err := store.Save(&AuthConfig{AdminHash: "hash"}); err != nil {
		t.Fatal(err)
	}

	stale := []string{"auth.json.123456.tmp", "auth.json.987.tmp"}
	kept := []string{"auth.json.bak", "other.json.123.tmp", "auth.json.tmp", "auth.jsonx.5.tmp", "notes.txt"}
	for _, name := range append(append([]string{}, stale...), kept...) {
		writeTestFile(t, filepath.Join(dir, name), "x")
	}
	staleLookingDirectory := filepath.Join(dir, "auth.json.777.tmp")
	if err := os.Mkdir(staleLookingDirectory, 0o755); err != nil {
		t.Fatal(err)
	}
	writeTestFile(t, filepath.Join(staleLookingDirectory, "inner"), "x")
	nested := filepath.Join(dir, "nested")
	if err := os.Mkdir(nested, 0o755); err != nil {
		t.Fatal(err)
	}
	writeTestFile(t, filepath.Join(nested, "auth.json.55.tmp"), "x")

	config, err := store.Load()
	if err != nil || config == nil || config.AdminHash != "hash" {
		t.Fatalf("auth file must still load: %v %+v", err, config)
	}

	for _, name := range stale {
		if _, err := os.Stat(filepath.Join(dir, name)); !os.IsNotExist(err) {
			t.Errorf("%s should have been removed", name)
		}
	}
	for _, name := range kept {
		if _, err := os.Stat(filepath.Join(dir, name)); err != nil {
			t.Errorf("%s should have been kept: %v", name, err)
		}
	}
	for _, survivor := range []string{filepath.Join(staleLookingDirectory, "inner"), filepath.Join(nested, "auth.json.55.tmp")} {
		if _, err := os.Stat(survivor); err != nil {
			t.Errorf("%s should have been kept: %v", survivor, err)
		}
	}
}

func TestServiceLoadCleansStaleTempFiles(t *testing.T) {
	dir := t.TempDir()
	stale := filepath.Join(dir, "auth.json.42.tmp")
	writeTestFile(t, stale, "partial")

	if _, err := NewSimpleAuthService(filepath.Join(dir, "auth.json")); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(stale); !os.IsNotExist(err) {
		t.Fatal("stale temp file should be removed when the service loads")
	}
}

func writeTestFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
}
