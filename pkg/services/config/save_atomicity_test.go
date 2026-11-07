package config

import (
	"path/filepath"
	"reflect"
	"testing"
)

func TestSaveLeavesMemoryUnchangedWhenWriteFails(t *testing.T) {
	svc := newServiceWithUnwritablePath(t)
	before := svc.Get()

	err := svc.Save(&Config{ServerPort: "2222", Libraries: []string{"other"}, ServerAllowedHosts: []string{"x.lan"}})
	if err == nil {
		t.Fatal("expected the write failure to be returned")
	}

	if after := svc.Get(); !reflect.DeepEqual(before, after) {
		t.Errorf("configuration changed despite the failed write:\nbefore %+v\nafter  %+v", before, after)
	}
}

func TestSaveRecoversAfterATransientWriteFailure(t *testing.T) {
	svc := newServiceWithUnwritablePath(t)
	if err := svc.Save(&Config{ServerPort: "2222"}); err == nil {
		t.Fatal("expected failure")
	}

	svc.path = filepath.Join(t.TempDir(), "config.json")
	if err := svc.Save(&Config{ServerPort: "3333"}); err != nil {
		t.Fatal(err)
	}
	if got := svc.Get().ServerPort; got != "3333" {
		t.Errorf("ServerPort = %q, want 3333 (the failed 2222 must not leak in)", got)
	}
}

func TestSaveKeepsSnapshotSemantics(t *testing.T) {
	svc, err := NewFileConfigService(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	caller := &Config{ServerPort: "2222", Libraries: []string{"first"}}

	if err := svc.Save(caller); err != nil {
		t.Fatal(err)
	}
	caller.ServerPort = "9999"
	caller.Libraries[0] = "mutated"

	saved := svc.Get()
	if saved.ServerPort != "2222" || saved.Libraries[0] != "first" {
		t.Errorf("later edits to the caller's config leaked into the service: %+v", saved)
	}
}
