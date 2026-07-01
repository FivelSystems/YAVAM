package database

import (
	"os"
	"path/filepath"
	"testing"
)

func tempDB(t *testing.T) *DB {
	t.Helper()
	dir := t.TempDir()
	db, err := Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

// TestSchemaCreation verifies that Open creates all expected tables.
func TestSchemaCreation(t *testing.T) {
	db := tempDB(t)

	tables := []string{
		"packages", "user_metadata", "dependencies",
		"hub_index", "libraries", "pockets", "pocket_items", "ui_layout",
	}
	for _, tbl := range tables {
		var name string
		err := db.conn.QueryRow(
			`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, tbl,
		).Scan(&name)
		if err != nil {
			t.Errorf("table %q missing: %v", tbl, err)
		}
	}
}

// TestMigrationIdempotency verifies that opening the DB twice doesn't error.
func TestMigrationIdempotency(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "idem.db")

	db1, err := Open(path)
	if err != nil {
		t.Fatalf("first Open: %v", err)
	}
	db1.Close()

	db2, err := Open(path)
	if err != nil {
		t.Fatalf("second Open: %v", err)
	}
	db2.Close()
}

// TestLibraryCRUD covers add, list, remove, and order.
func TestLibraryCRUD(t *testing.T) {
	db := tempDB(t)

	// Add two libraries
	if err := db.UpsertLibrary("/lib/a"); err != nil {
		t.Fatalf("UpsertLibrary a: %v", err)
	}
	if err := db.UpsertLibrary("/lib/b"); err != nil {
		t.Fatalf("UpsertLibrary b: %v", err)
	}

	// Idempotent add
	if err := db.UpsertLibrary("/lib/a"); err != nil {
		t.Fatalf("duplicate UpsertLibrary a: %v", err)
	}

	paths, err := db.GetLibraryPaths()
	if err != nil {
		t.Fatalf("GetLibraryPaths: %v", err)
	}
	if len(paths) != 2 {
		t.Fatalf("expected 2 libraries, got %d: %v", len(paths), paths)
	}

	// Remove
	if err := db.DeleteLibrary("/lib/a"); err != nil {
		t.Fatalf("DeleteLibrary: %v", err)
	}
	paths, _ = db.GetLibraryPaths()
	if len(paths) != 1 || paths[0] != "/lib/b" {
		t.Fatalf("after delete, expected [\"/lib/b\"], got %v", paths)
	}
}

// TestSetLibraryOrder verifies that reordering persists to sort_order and that
// GetLibraryPaths reflects the new order — using Windows-style backslash paths
// to match real-world storage.
func TestSetLibraryOrder(t *testing.T) {
	db := tempDB(t)

	initial := []string{`Z:\Lib3`, `D:\Users\fff\Downloads`, `D:\Users\fff\Documents\TestPlace`}
	for _, p := range initial {
		if err := db.UpsertLibrary(p); err != nil {
			t.Fatalf("UpsertLibrary %q: %v", p, err)
		}
	}

	// Reorder: move the last library to the front.
	reordered := []string{`D:\Users\fff\Documents\TestPlace`, `Z:\Lib3`, `D:\Users\fff\Downloads`}
	if err := db.SetLibraryOrder(reordered); err != nil {
		t.Fatalf("SetLibraryOrder: %v", err)
	}

	got, err := db.GetLibraryPaths()
	if err != nil {
		t.Fatalf("GetLibraryPaths: %v", err)
	}
	for i := range reordered {
		if got[i] != reordered[i] {
			t.Fatalf("order not persisted at %d: got %v, want %v", i, got, reordered)
		}
	}
}

// TestMigrateLibrariesFromConfig covers the one-time config.json migration.
func TestMigrateLibrariesFromConfig(t *testing.T) {
	db := tempDB(t)

	src := []string{"/alpha", "/beta", "/gamma"}
	if err := db.MigrateLibrariesFromConfig(src); err != nil {
		t.Fatalf("MigrateLibrariesFromConfig: %v", err)
	}

	// Running again must be idempotent.
	if err := db.MigrateLibrariesFromConfig(src); err != nil {
		t.Fatalf("second MigrateLibrariesFromConfig: %v", err)
	}

	paths, err := db.GetLibraryPaths()
	if err != nil {
		t.Fatalf("GetLibraryPaths: %v", err)
	}
	if len(paths) != len(src) {
		t.Fatalf("expected %d libraries, got %d", len(src), len(paths))
	}
}

// TestDuplicatePackageKeyCoexist verifies the core identity fix: the same
// logical package (package_key) may exist as multiple physical rows — both in
// different libraries and within the same library at different folders — while
// upserting the same (library_id, rel_path) updates in place.
func TestDuplicatePackageKeyCoexist(t *testing.T) {
	db := tempDB(t)

	libA, err := db.EnsureLibrary("/libA")
	if err != nil {
		t.Fatalf("EnsureLibrary A: %v", err)
	}
	libB, err := db.EnsureLibrary("/libB")
	if err != nil {
		t.Fatalf("EnsureLibrary B: %v", err)
	}

	const key = "Creator.Package.1"
	base := func(libID int64, rel string) PackageRow {
		return PackageRow{
			LibraryID: libID, RelPath: rel, FileName: "Package.1.var",
			SizeBytes: 100, IsEnabled: true, PackageKey: key,
			Family: "Creator.Package", ScannedAt: Now(),
		}
	}

	// Same key, same library, two different folders → two rows.
	if err := db.UpsertPackage(base(libA, "Looks/Package.1.var")); err != nil {
		t.Fatalf("upsert A/Looks: %v", err)
	}
	if err := db.UpsertPackage(base(libA, "Backup/Package.1.var")); err != nil {
		t.Fatalf("upsert A/Backup: %v", err)
	}
	// Same key again in a different library → third row.
	if err := db.UpsertPackage(base(libB, "Package.1.var")); err != nil {
		t.Fatalf("upsert B: %v", err)
	}

	var keyCount int
	db.conn.QueryRow(`SELECT COUNT(*) FROM packages WHERE package_key = ?`, key).Scan(&keyCount)
	if keyCount != 3 {
		t.Fatalf("expected 3 physical rows for one package_key, got %d", keyCount)
	}

	// Re-upserting the same (library_id, rel_path) must UPDATE, not duplicate.
	updated := base(libA, "Looks/Package.1.var")
	updated.SizeBytes = 999
	if err := db.UpsertPackage(updated); err != nil {
		t.Fatalf("re-upsert A/Looks: %v", err)
	}
	db.conn.QueryRow(`SELECT COUNT(*) FROM packages WHERE package_key = ?`, key).Scan(&keyCount)
	if keyCount != 3 {
		t.Fatalf("re-upsert must update in place, got %d rows", keyCount)
	}
	var size int64
	db.conn.QueryRow(
		`SELECT size_bytes FROM packages WHERE library_id = ? AND rel_path = ?`,
		libA, "Looks/Package.1.var",
	).Scan(&size)
	if size != 999 {
		t.Fatalf("expected updated size 999, got %d", size)
	}
}

// TestDeletePackagesOlderThan verifies stale DB records are removed using the
// timestamp-based orphan cleanup approach used during re-scans.
func TestDeletePackagesOlderThan(t *testing.T) {
	db := tempDB(t)
	libID, err := db.EnsureLibrary("/mylib")
	if err != nil {
		t.Fatalf("EnsureLibrary: %v", err)
	}

	// Simulate start of scan: record timestamp BEFORE inserting any packages.
	scanStart := Now()

	// Seed two "old" packages — they were in the DB from a previous scan.
	for _, name := range []string{"old1", "old2"} {
		_ = db.UpsertPackage(PackageRow{
			LibraryID: libID, RelPath: name + ".var", FileName: name + ".var",
			SizeBytes: 100, IsEnabled: true, PackageKey: "C.P." + name,
			Family: "C.P", ScannedAt: scanStart - 10, // stamped before this scan
		})
	}

	// Simulate the scanner finding only "old2" (old1 is gone from disk).
	_ = db.UpsertPackage(PackageRow{
		LibraryID: libID, RelPath: "old2.var", FileName: "old2.var",
		SizeBytes: 100, IsEnabled: true, PackageKey: "C.P.old2",
		Family: "C.P", ScannedAt: scanStart + 1, // updated by this scan
	})

	// Clean up: delete anything not touched by this scan.
	if err := db.DeletePackagesOlderThan(libID, scanStart); err != nil {
		t.Fatalf("DeletePackagesOlderThan: %v", err)
	}

	var count int
	if err := db.conn.QueryRow(`SELECT COUNT(*) FROM packages WHERE library_id = ?`, libID).Scan(&count); err != nil {
		t.Fatalf("count query: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected 1 package remaining, got %d", count)
	}

	var remaining string
	db.conn.QueryRow(`SELECT rel_path FROM packages WHERE library_id = ?`, libID).Scan(&remaining)
	if remaining != "old2.var" {
		t.Fatalf("expected old2 to survive, got %q", remaining)
	}
}

// TestBatchUpsert verifies UpsertPackages commits all rows in one transaction.
func TestBatchUpsert(t *testing.T) {
	db := tempDB(t)
	libID, err := db.EnsureLibrary("/lib")
	if err != nil {
		t.Fatalf("EnsureLibrary: %v", err)
	}

	pkgs := make([]PackageRow, 10)
	for i := range pkgs {
		pkgs[i] = PackageRow{
			LibraryID: libID, RelPath: "pkg" + string(rune('0'+i)) + ".var",
			FileName: "pkg.var", SizeBytes: int64(i * 100), IsEnabled: true,
			PackageKey: "Creator.Pkg." + string(rune('0'+i)), Family: "Creator.Pkg",
			ScannedAt: Now(),
		}
	}

	if err := db.UpsertPackages(pkgs); err != nil {
		t.Fatalf("UpsertPackages: %v", err)
	}

	var count int
	db.conn.QueryRow(`SELECT COUNT(*) FROM packages`).Scan(&count)
	if count != 10 {
		t.Fatalf("expected 10 rows, got %d", count)
	}
}

// TestUserConfigDir is a sanity check that the OS user config dir is accessible.
func TestUserConfigDir(t *testing.T) {
	dir, err := os.UserConfigDir()
	if err != nil {
		t.Fatalf("os.UserConfigDir: %v", err)
	}
	if dir == "" {
		t.Fatal("empty config dir")
	}
}
