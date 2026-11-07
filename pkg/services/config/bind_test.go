package config

import (
	"net"
	"os"
	"path/filepath"
	"testing"
)

func firstLocalInterfaceIP(t *testing.T) string {
	t.Helper()
	addresses, err := net.InterfaceAddrs()
	if err != nil {
		t.Skipf("no interface addresses: %v", err)
	}
	for _, address := range addresses {
		if network, ok := address.(*net.IPNet); ok {
			return network.IP.String()
		}
	}
	t.Skip("no local interface IP available")
	return ""
}

func TestValidateBindAddressAccepts(t *testing.T) {
	for _, value := range []string{"", "all", "loopback", "127.0.0.1", firstLocalInterfaceIP(t)} {
		if err := ValidateBindAddress(value); err != nil {
			t.Errorf("ValidateBindAddress(%q) rejected: %v", value, err)
		}
	}
}

func TestValidateBindAddressRejects(t *testing.T) {
	for _, value := range []string{
		"localhost", "example.com", "garbage", "ALL", "0.0.0.0/0", "999.1.1.1",
		"203.0.113.77", " 127.0.0.1", "127.0.0.1:80", "-1",
	} {
		if err := ValidateBindAddress(value); err == nil {
			t.Errorf("ValidateBindAddress(%q) accepted, want rejection", value)
		}
	}
}

func TestResolveBindHost(t *testing.T) {
	cases := map[string]string{
		"":         "0.0.0.0",
		"all":      "0.0.0.0",
		"loopback": "127.0.0.1",
		"10.1.2.3": "10.1.2.3",
	}
	for value, want := range cases {
		if got := ResolveBindHost(value); got != want {
			t.Errorf("ResolveBindHost(%q) = %q, want %q", value, got, want)
		}
	}
}

func TestConfigWithoutNewKeysKeepsSafeDefaults(t *testing.T) {
	dir := t.TempDir()
	legacy := `{"libraries":["C:/Lib"],"setupDone":true,"serverEnabled":true,"serverPort":"18888"}`
	if err := os.WriteFile(filepath.Join(dir, "config.json"), []byte(legacy), 0o644); err != nil {
		t.Fatal(err)
	}

	svc, err := NewFileConfigService(dir)
	if err != nil {
		t.Fatal(err)
	}
	cfg := svc.Get()

	if cfg.AllowRemotePasswordLogin {
		t.Error("AllowRemotePasswordLogin must default to false for configs without the key")
	}
	if cfg.ServerBindAddress != "" {
		t.Errorf("unset bind address must stay empty (all interfaces), got %q", cfg.ServerBindAddress)
	}
}

func TestStaleBindAddressFallsBackToLoopbackOnLoad(t *testing.T) {
	dir := t.TempDir()
	stale := `{"setupDone":true,"serverBindAddress":"203.0.113.77"}`
	if err := os.WriteFile(filepath.Join(dir, "config.json"), []byte(stale), 0o644); err != nil {
		t.Fatal(err)
	}

	svc, err := NewFileConfigService(dir)
	if err != nil {
		t.Fatal(err)
	}
	if got := svc.Get().ServerBindAddress; got != BindLoopback {
		t.Errorf("stale bind address must fail closed to %q, got %q", BindLoopback, got)
	}
}

func TestUpdateNormalisesInvalidBindAddress(t *testing.T) {
	svc, err := NewFileConfigService(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.Update(func(c *Config) { c.ServerBindAddress = "evil.example.com" }); err != nil {
		t.Fatal(err)
	}
	if got := svc.Get().ServerBindAddress; got != BindLoopback {
		t.Errorf("invalid bind address must become %q, got %q", BindLoopback, got)
	}
}

func TestRemotePasswordLoginPersists(t *testing.T) {
	dir := t.TempDir()
	svc, _ := NewFileConfigService(dir)
	if err := svc.Update(func(c *Config) { c.AllowRemotePasswordLogin = true }); err != nil {
		t.Fatal(err)
	}
	reloaded, _ := NewFileConfigService(dir)
	if !reloaded.Get().AllowRemotePasswordLogin {
		t.Error("AllowRemotePasswordLogin did not persist")
	}
}
