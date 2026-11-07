package config

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestNormaliseAllowedHosts(t *testing.T) {
	got := normaliseAllowedHosts([]string{" YAVAM.Home.Lan ", "", "yavam.home.lan", "nas.lan."})
	want := []string{"yavam.home.lan", "nas.lan"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
	if normaliseAllowedHosts([]string{"  ", ""}) != nil {
		t.Error("blank-only input must normalise to nil")
	}
}

func TestAllowedHostsDefaultEmptyAndPersistNormalised(t *testing.T) {
	dir := t.TempDir()
	svc, err := NewFileConfigService(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(svc.Get().ServerAllowedHosts) != 0 {
		t.Fatalf("default must be empty, got %v", svc.Get().ServerAllowedHosts)
	}

	if err := svc.Update(func(c *Config) { c.ServerAllowedHosts = []string{"Yavam.LAN"} }); err != nil {
		t.Fatal(err)
	}
	reloaded, err := NewFileConfigService(dir)
	if err != nil {
		t.Fatal(err)
	}
	if got := reloaded.Get().ServerAllowedHosts; !reflect.DeepEqual(got, []string{"yavam.lan"}) {
		t.Errorf("persisted hosts = %v", got)
	}
}

func TestAllowedHostsLoadedFromFileAreNormalised(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "config.json"), []byte(`{"serverAllowedHosts":["  Box.LAN "]}`), 0600); err != nil {
		t.Fatal(err)
	}
	svc, err := NewFileConfigService(dir)
	if err != nil {
		t.Fatal(err)
	}
	if got := svc.Get().ServerAllowedHosts; !reflect.DeepEqual(got, []string{"box.lan"}) {
		t.Errorf("loaded hosts = %v", got)
	}
}

func TestCloneDoesNotShareAllowedHosts(t *testing.T) {
	original := &Config{ServerAllowedHosts: []string{"a.lan"}}
	clone := original.Clone()
	clone.ServerAllowedHosts[0] = "changed"
	if original.ServerAllowedHosts[0] != "a.lan" {
		t.Error("clone shares the allowed hosts slice")
	}
}
