package manager

import (
	"os"
	"path/filepath"
	"testing"
	"yavam/pkg/database"
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
		library:  library.NewLibraryService(system.NewSystemService(nil), nil, nil),
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

// testManagerWithDB creates a Manager wired to a real in-temp-dir SQLite DB.
func testManagerWithDB(t *testing.T) (*Manager, func()) {
	t.Helper()
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "test.db")
	db, err := database.Open(dbPath)
	if err != nil {
		t.Fatalf("open test DB: %v", err)
	}

	m := &Manager{
		system:   system.NewSystemService(nil),
		library:  library.NewLibraryService(system.NewSystemService(nil), nil, db),
		db:       db,
		config:   &MockConfigService{cfg: &config.Config{}},
		DataPath: tempDir,
	}
	return m, func() { db.Close(); os.RemoveAll(tempDir) }
}

// TestLibraryCRUDViaManager covers AddLibrary, GetLibraries, RemoveLibrary, SetLibraries
// all routing through the SQLite DB.
func TestLibraryCRUDViaManager(t *testing.T) {
	m, cleanup := testManagerWithDB(t)
	defer cleanup()

	// Initially empty.
	libs := m.GetLibraries()
	if len(libs) != 0 {
		t.Fatalf("expected 0 libraries initially, got %d", len(libs))
	}

	// Add two libraries.
	if err := m.AddLibrary("/lib/alpha"); err != nil {
		t.Fatalf("AddLibrary alpha: %v", err)
	}
	if err := m.AddLibrary("/lib/beta"); err != nil {
		t.Fatalf("AddLibrary beta: %v", err)
	}

	libs = m.GetLibraries()
	if len(libs) != 2 {
		t.Fatalf("expected 2 libraries, got %d: %v", len(libs), libs)
	}

	// Idempotent add.
	if err := m.AddLibrary("/lib/alpha"); err != nil {
		t.Fatalf("duplicate AddLibrary: %v", err)
	}
	libs = m.GetLibraries()
	if len(libs) != 2 {
		t.Fatalf("duplicate add should not grow list; got %d", len(libs))
	}

	// Remove one.
	if err := m.RemoveLibrary("/lib/alpha"); err != nil {
		t.Fatalf("RemoveLibrary: %v", err)
	}
	libs = m.GetLibraries()
	if len(libs) != 1 || libs[0] != "/lib/beta" {
		t.Fatalf("after remove, expected [/lib/beta], got %v", libs)
	}

	// SetLibraries (reorder).
	_ = m.AddLibrary("/lib/gamma")
	if err := m.SetLibraries([]string{"/lib/gamma", "/lib/beta"}); err != nil {
		t.Fatalf("SetLibraries: %v", err)
	}
	libs = m.GetLibraries()
	if len(libs) != 2 || libs[0] != "/lib/gamma" {
		t.Fatalf("after SetLibraries, expected gamma first, got %v", libs)
	}
}

// TestLibraryMigrationFromConfig verifies the one-time migration from config.json.
func TestLibraryMigrationFromConfig(t *testing.T) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "test.db")
	db, err := database.Open(dbPath)
	if err != nil {
		t.Fatalf("open test DB: %v", err)
	}
	defer db.Close()

	cfg := &MockConfigService{cfg: &config.Config{
		Libraries: []string{"/migrated/a", "/migrated/b"},
	}}

	// Simulate what NewManager does on first launch.
	if err := db.MigrateLibrariesFromConfig(cfg.Get().Libraries); err != nil {
		t.Fatalf("MigrateLibrariesFromConfig: %v", err)
	}
	// Zero out config.json libraries.
	_ = cfg.Update(func(c *config.Config) { c.Libraries = []string{} })

	// Config should now be empty.
	if len(cfg.Get().Libraries) != 0 {
		t.Fatalf("config.Libraries should be empty after migration, got %v", cfg.Get().Libraries)
	}

	// DB should have the two libraries.
	paths, _ := db.GetLibraryPaths()
	if len(paths) != 2 {
		t.Fatalf("expected 2 migrated libraries in DB, got %d: %v", len(paths), paths)
	}
}
