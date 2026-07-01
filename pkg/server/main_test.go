package server

import (
	"os"
	"testing"
)

// TestMain isolates the database from the real user data directory. The server
// tests build a Manager via NewManager, which opens a SQLite DB; without this
// they would write their fixture libraries into the production
// %AppData%\YAVAM\yavam.db. See YAVAM_DATA_DIR in manager.NewManager.
func TestMain(m *testing.M) {
	dir, err := os.MkdirTemp("", "yavam-server-test")
	if err != nil {
		panic(err)
	}
	os.Setenv("YAVAM_DATA_DIR", dir)
	code := m.Run()
	os.RemoveAll(dir)
	os.Exit(code)
}
