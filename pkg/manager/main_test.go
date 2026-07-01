package manager

import (
	"os"
	"testing"
)

// TestMain isolates the database from the real user data directory. Tests that
// construct a Manager via NewManager open a SQLite DB; without this they would
// write to the production %AppData%\YAVAM\yavam.db (this is how "C:/Allowed" and
// the working-dir path leaked into real user libraries). See YAVAM_DATA_DIR.
func TestMain(m *testing.M) {
	dir, err := os.MkdirTemp("", "yavam-manager-test")
	if err != nil {
		panic(err)
	}
	os.Setenv("YAVAM_DATA_DIR", dir)
	code := m.Run()
	os.RemoveAll(dir)
	os.Exit(code)
}
