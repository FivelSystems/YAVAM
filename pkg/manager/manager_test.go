package manager

import (
	"os"
	"path/filepath"
	"testing"
	"yavam/pkg/services/config"
	"yavam/pkg/services/library"
	"yavam/pkg/services/system"
)

// Mock Config Service
// Mock Config Service
type MockConfigService struct {
	cfg *config.Config
}

func (m *MockConfigService) Load() (*config.Config, error) {
	if m.cfg == nil {
		return &config.Config{}, nil
	}
	return m.cfg, nil
}
func (m *MockConfigService) Save(cfg *config.Config) error { m.cfg = cfg; return nil }
func (m *MockConfigService) Get() *config.Config {
	if m.cfg == nil {
		return &config.Config{}
	}
	return m.cfg
}
func (m *MockConfigService) IsConfigured() bool {
	if m.cfg == nil {
		return false
	}
	return m.cfg.SetupDone
}
func (m *MockConfigService) FinishSetup() error {
	if m.cfg == nil {
		m.cfg = &config.Config{}
	}
	m.cfg.SetupDone = true
	return nil
}
func (m *MockConfigService) Update(fn func(*config.Config)) error {
	if m.cfg == nil {
		m.cfg = &config.Config{}
	}
	fn(m.cfg)
	return nil
}

func TestFinishSetup(t *testing.T) {
	// Setup temporary directory for test
	tempDir, err := os.MkdirTemp("", "yavam_test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	// Initialize Manager with temp path
	// We manually construct Manager to inject the temp path as DataPath
	// since NewManager hardcodes it to user config dir.
	m := &Manager{
		system:   system.NewSystemService(nil),
		library:  library.NewLibraryService(system.NewSystemService(nil), nil),
		config:   &MockConfigService{},
		DataPath: filepath.Join(tempDir, "YAVAM_TEST"),
	}

	// 1. Test FinishSetup (should persist setupDone via config service)
	err = m.FinishSetup()
	if err != nil {
		t.Fatalf("FinishSetup failed: %v", err)
	}

	// 2. Verify setupDone is reflected in the config
	if !m.config.Get().SetupDone {
		t.Errorf("SetupDone was not set to true after FinishSetup")
	}

	// 3. Verify IsConfigured delegates to config service
	if !m.IsConfigured() {
		t.Errorf("IsConfigured returned false after setup")
	}
}
