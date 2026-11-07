package config

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

// newServiceWithUnwritablePath points the service at a directory, which no
// write can replace, so every persist attempt fails.
func newServiceWithUnwritablePath(t *testing.T) *fileConfigService {
	t.Helper()
	return &fileConfigService{
		path:   t.TempDir(),
		config: &Config{Libraries: []string{"first"}, ServerPort: "1111", Keybinds: map[string][]string{"a": {"X"}}},
	}
}

func TestUpdateLeavesMemoryUnchangedWhenWriteFails(t *testing.T) {
	svc := newServiceWithUnwritablePath(t)
	before := svc.Get()

	err := svc.Update(func(c *Config) {
		c.ServerPort = "2222"
		c.Libraries = append(c.Libraries, "second")
		c.Libraries[0] = "changed"
		c.Keybinds["a"][0] = "Y"
		c.ServerAllowedHosts = []string{"x.lan"}
	})
	if err == nil {
		t.Fatal("expected the write failure to be returned")
	}

	if after := svc.Get(); !reflect.DeepEqual(before, after) {
		t.Errorf("configuration changed despite the failed write:\nbefore %+v\nafter  %+v", before, after)
	}
}

func TestUpdateAppliesToMemoryAndDiskOnSuccess(t *testing.T) {
	dir := t.TempDir()
	svc, err := NewFileConfigService(dir)
	if err != nil {
		t.Fatal(err)
	}

	if err := svc.Update(func(c *Config) { c.ServerPort = "2222" }); err != nil {
		t.Fatal(err)
	}
	if svc.Get().ServerPort != "2222" {
		t.Error("memory not updated")
	}
	if _, err := os.Stat(filepath.Join(dir, "config.json")); err != nil {
		t.Fatalf("config not written: %v", err)
	}
	reloaded, _ := NewFileConfigService(dir)
	if reloaded.Get().ServerPort != "2222" {
		t.Error("disk not updated")
	}
}

func TestUpdateRecoversAfterATransientWriteFailure(t *testing.T) {
	svc := newServiceWithUnwritablePath(t)
	if err := svc.Update(func(c *Config) { c.ServerPort = "2222" }); err == nil {
		t.Fatal("expected failure")
	}

	svc.path = filepath.Join(t.TempDir(), "config.json")
	if err := svc.Update(func(c *Config) { c.ServerPort = "3333" }); err != nil {
		t.Fatal(err)
	}
	if got := svc.Get().ServerPort; got != "3333" {
		t.Errorf("ServerPort = %q, want 3333 (the failed 2222 must not leak in)", got)
	}
}
