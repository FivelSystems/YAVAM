package database

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func pragmaValue(t *testing.T, db *DB, name string) string {
	t.Helper()
	var value string
	if err := db.conn.QueryRow("PRAGMA " + name).Scan(&value); err != nil {
		t.Fatalf("PRAGMA %s: %v", name, err)
	}
	return value
}

func assertEffectivePragmas(t *testing.T, db *DB) {
	t.Helper()
	expected := map[string]string{
		"journal_mode": "wal",
		"foreign_keys": "1",
		"busy_timeout": "5000",
		"synchronous":  "1",
	}
	for name, want := range expected {
		if got := pragmaValue(t, db, name); got != want {
			t.Errorf("PRAGMA %s = %q, want %q", name, got, want)
		}
	}
}

func TestPragmasAppliedOnFreshAndExistingDatabase(t *testing.T) {
	path := filepath.Join(t.TempDir(), "pragmas.db")

	fresh, err := Open(path)
	if err != nil {
		t.Fatalf("Open fresh: %v", err)
	}
	assertEffectivePragmas(t, fresh)
	fresh.Close()

	reopened, err := Open(path)
	if err != nil {
		t.Fatalf("Open existing: %v", err)
	}
	defer reopened.Close()
	assertEffectivePragmas(t, reopened)
}

func TestOpenPathWithSpecialCharacters(t *testing.T) {
	directory := filepath.Join(t.TempDir(), specialDirName())
	if err := os.MkdirAll(directory, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	path := filepath.Join(directory, "idx #%.db")

	db, err := Open(path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer db.Close()
	assertEffectivePragmas(t, db)

	if !pathExists(path) {
		t.Errorf("database file not created at %q", path)
	}
}

func TestDeleteLibraryCascadesToPackages(t *testing.T) {
	db := tempDB(t)
	libraryID, err := db.EnsureLibrary(filepath.Join(t.TempDir(), "lib"))
	if err != nil {
		t.Fatalf("EnsureLibrary: %v", err)
	}
	insertPackage(t, db, libraryID, "a.var")

	if _, err := db.conn.Exec(`DELETE FROM libraries WHERE id = ?`, libraryID); err != nil {
		t.Fatalf("delete library: %v", err)
	}
	if count := countRows(t, db, "packages"); count != 0 {
		t.Errorf("packages after library delete = %d, want 0", count)
	}
}

func TestPackageInsertWithoutLibraryIsRejected(t *testing.T) {
	db := tempDB(t)
	_, err := db.conn.Exec(`
		INSERT INTO packages (library_id, rel_path, file_name, size_bytes, scanned_at)
		VALUES (9999, 'x.var', 'x.var', 1, 1)`)
	if err == nil {
		t.Fatal("expected foreign key violation for orphan package insert")
	}
}

func TestDeletePocketCascadesToItems(t *testing.T) {
	db := tempDB(t)
	mustExec(t, db, `INSERT INTO pockets (session_id, created_at) VALUES ('s1', 1), ('s2', 1)`)
	mustExec(t, db, `INSERT INTO pocket_items (session_id, package_id, added_at) VALUES ('s1', 1, 1), ('s1', 2, 1), ('s2', 1, 1)`)

	mustExec(t, db, `DELETE FROM pockets WHERE session_id = 's1'`)

	if count := countRows(t, db, "pocket_items"); count != 1 {
		t.Errorf("pocket_items after pocket delete = %d, want 1", count)
	}
}

func TestOpenRemovesOrphanRowsFromLegacyDatabase(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.db")
	db, err := Open(path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	mustExec(t, db, `PRAGMA foreign_keys = OFF`)
	mustExec(t, db, `
		INSERT INTO packages (library_id, rel_path, file_name, size_bytes, scanned_at)
		VALUES (9999, 'orphan.var', 'orphan.var', 1, 1)`)
	mustExec(t, db, `INSERT INTO pocket_items (session_id, package_id, added_at) VALUES ('ghost', 1, 1)`)
	db.Close()

	reopened, err := Open(path)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	defer reopened.Close()
	if count := countRows(t, reopened, "packages"); count != 0 {
		t.Errorf("orphan packages remaining = %d", count)
	}
	if count := countRows(t, reopened, "pocket_items"); count != 0 {
		t.Errorf("orphan pocket_items remaining = %d", count)
	}
}

func insertPackage(t *testing.T, db *DB, libraryID int64, relPath string) {
	t.Helper()
	mustExec(t, db, `
		INSERT INTO packages (library_id, rel_path, file_name, size_bytes, scanned_at)
		VALUES (?, ?, ?, 1, 1)`, libraryID, relPath, relPath)
}

func mustExec(t *testing.T, db *DB, query string, args ...any) {
	t.Helper()
	if _, err := db.conn.Exec(query, args...); err != nil {
		t.Fatalf("exec %q: %v", query, err)
	}
}

func countRows(t *testing.T, db *DB, table string) int {
	t.Helper()
	var count int
	if err := db.conn.QueryRow("SELECT COUNT(*) FROM " + table).Scan(&count); err != nil {
		t.Fatalf("count %s: %v", table, err)
	}
	return count
}

func pathExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// specialDirName includes '?' where the filesystem allows it; Windows does not.
func specialDirName() string {
	if runtime.GOOS == "windows" {
		return "my lib #1 100% done"
	}
	return "my lib #1 100% what?"
}

func TestBuildDSNEscapesReservedCharacters(t *testing.T) {
	dsn, err := buildDSN(filepath.Join(t.TempDir(), "a b?c#d%e.db"))
	if err != nil {
		t.Fatalf("buildDSN: %v", err)
	}
	for _, raw := range []string{"a b", "?c", "#d", "%e"} {
		if strings.Contains(dsn, raw) {
			t.Errorf("DSN %q contains unescaped %q", dsn, raw)
		}
	}
}