package config

import (
	"reflect"
	"sync"
	"testing"
)

func TestGetReturnsASnapshot(t *testing.T) {
	svc, err := NewFileConfigService(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.Update(func(c *Config) {
		c.Libraries = []string{"first"}
		c.Keybinds = map[string][]string{"action": {"CTRL", "K"}}
	}); err != nil {
		t.Fatal(err)
	}

	snapshot := svc.Get()
	snapshot.AllowRemotePasswordLogin = true
	snapshot.Libraries[0] = "tampered"
	snapshot.Keybinds["action"][0] = "ALT"
	snapshot.Keybinds["extra"] = nil

	stored := svc.Get()
	if stored.AllowRemotePasswordLogin {
		t.Error("mutating a snapshot must not change the stored flag")
	}
	if !reflect.DeepEqual(stored.Libraries, []string{"first"}) {
		t.Errorf("libraries leaked through the snapshot: %v", stored.Libraries)
	}
	if !reflect.DeepEqual(stored.Keybinds, map[string][]string{"action": {"CTRL", "K"}}) {
		t.Errorf("keybinds leaked through the snapshot: %v", stored.Keybinds)
	}
}

func TestSaveStoresACopyOfTheArgument(t *testing.T) {
	svc, err := NewFileConfigService(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	cfg := &Config{ServerPort: "9000", Libraries: []string{"kept"}}
	if err := svc.Save(cfg); err != nil {
		t.Fatal(err)
	}

	cfg.ServerPort = "changed-by-caller"
	cfg.Libraries[0] = "changed-by-caller"

	stored := svc.Get()
	if stored.ServerPort != "9000" || stored.Libraries[0] != "kept" {
		t.Errorf("Save must not alias the caller's value: %+v", stored)
	}
}

func TestConcurrentReadsAndUpdatesAreRaceFree(t *testing.T) {
	svc, err := NewFileConfigService(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}

	const rounds = 50
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		for i := 0; i < rounds; i++ {
			svc.Update(func(c *Config) { c.AllowRemotePasswordLogin = i%2 == 0 })
		}
	}()
	go func() {
		defer wg.Done()
		for i := 0; i < rounds; i++ {
			_ = svc.Get().AllowRemotePasswordLogin
		}
	}()
	wg.Wait()
}

func TestListenPortFallsBackToDefault(t *testing.T) {
	if got := (&Config{}).ListenPort(); got != DefaultServerPort {
		t.Errorf("empty port: got %q, want %q", got, DefaultServerPort)
	}
	if got := (&Config{ServerPort: "9000"}).ListenPort(); got != "9000" {
		t.Errorf("configured port: got %q", got)
	}
}
