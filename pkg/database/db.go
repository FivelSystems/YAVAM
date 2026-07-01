package database

import (
	"database/sql"
	"fmt"
	"time"

	_ "modernc.org/sqlite" // registers the "sqlite" driver
)

// DB wraps a SQLite connection and exposes typed repository methods.
// All write operations are safe to call concurrently — the underlying
// *sql.DB connection pool serialises writes automatically.
type DB struct {
	conn *sql.DB
}

// Open opens (or creates) the SQLite database at the given path,
// runs all pending migrations, and returns a ready-to-use DB.
func Open(path string) (*DB, error) {
	// WAL mode for better concurrent read performance.
	// foreign_keys enforces CASCADE deletes (packages → libraries, pocket_items → pockets).
	dsn := fmt.Sprintf("file:%s?_journal_mode=WAL&_foreign_keys=on", path)
	conn, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("database: open %q: %w", path, err)
	}

	// SQLite only supports one writer at a time; cap the pool to avoid
	// "database is locked" errors from concurrent goroutines.
	conn.SetMaxOpenConns(1)

	db := &DB{conn: conn}
	if err := db.applyMigrations(); err != nil {
		conn.Close()
		return nil, fmt.Errorf("database: migrate: %w", err)
	}
	return db, nil
}

// Close releases the underlying connection.
func (db *DB) Close() error {
	return db.conn.Close()
}

// ── Migrations ────────────────────────────────────────────────────────────────

// applyMigrations runs all pending migrations in order.
// PRAGMA user_version tracks how many have been applied.
func (db *DB) applyMigrations() error {
	var version int
	if err := db.conn.QueryRow("PRAGMA user_version").Scan(&version); err != nil {
		return fmt.Errorf("read user_version: %w", err)
	}

	pending := migrations[version:]
	for i, stmt := range pending {
		if _, err := db.conn.Exec(stmt); err != nil {
			return fmt.Errorf("migration %d: %w", version+i+1, err)
		}
		// Advance the version counter after each successful migration.
		newVersion := version + i + 1
		if _, err := db.conn.Exec(fmt.Sprintf("PRAGMA user_version = %d", newVersion)); err != nil {
			return fmt.Errorf("set user_version=%d: %w", newVersion, err)
		}
	}
	return nil
}

// ── Library repository ────────────────────────────────────────────────────────

// libraryInsert inserts a library at the given path with default permissions,
// assigning the next sort_order. No-op if the path already exists. Shared by
// UpsertLibrary, EnsureLibrary, and MigrateLibrariesFromConfig.
const libraryInsert = `
	INSERT INTO libraries (path, label, is_public, allow_view, allow_write,
	                       allow_download, allow_bulk_dl, bundle_limit_enabled,
	                       bundle_max_packages, bundle_count_deps, sort_order)
	VALUES (?, '', 1, 1, 0, 1, 0, 1, 50, 1,
	        (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM libraries))
	ON CONFLICT(path) DO NOTHING
`

// GetLibraries returns all library rows ordered by sort_order.
func (db *DB) GetLibraries() ([]LibraryRow, error) {
	rows, err := db.conn.Query(`
		SELECT id, path, label, password_hash, is_public,
		       allow_view, allow_write, allow_download, allow_bulk_dl,
		       bundle_limit_enabled, bundle_max_packages, bundle_count_deps, sort_order
		FROM libraries
		ORDER BY sort_order ASC, path ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var libs []LibraryRow
	for rows.Next() {
		var l LibraryRow
		if err := rows.Scan(
			&l.ID, &l.Path, &l.Label, &l.PasswordHash, &l.IsPublic,
			&l.AllowView, &l.AllowWrite, &l.AllowDownload, &l.AllowBulkDL,
			&l.BundleLimitEnabled, &l.BundleMaxPackages, &l.BundleCountDeps, &l.SortOrder,
		); err != nil {
			return nil, err
		}
		libs = append(libs, l)
	}
	return libs, rows.Err()
}

// GetLibraryPaths returns just the paths, ordered by sort_order.
// This is the fast path used by most callers.
func (db *DB) GetLibraryPaths() ([]string, error) {
	rows, err := db.conn.Query(`SELECT path FROM libraries ORDER BY sort_order ASC, path ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var paths []string
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err != nil {
			return nil, err
		}
		paths = append(paths, p)
	}
	return paths, rows.Err()
}

// EnsureLibrary inserts the library at path (with default permissions) if it is
// not already present, and returns its surrogate id. Idempotent.
func (db *DB) EnsureLibrary(path string) (int64, error) {
	if _, err := db.conn.Exec(libraryInsert, path); err != nil {
		return 0, err
	}
	var id int64
	if err := db.conn.QueryRow(`SELECT id FROM libraries WHERE path = ?`, path).Scan(&id); err != nil {
		return 0, err
	}
	return id, nil
}

// UpsertLibrary inserts a library at path with default permissions,
// or does nothing if it already exists.
func (db *DB) UpsertLibrary(path string) error {
	_, err := db.conn.Exec(libraryInsert, path)
	return err
}

// DeleteLibrary removes a library and all package rows belonging to it.
func (db *DB) DeleteLibrary(path string) error {
	tx, err := db.conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(
		`DELETE FROM packages WHERE library_id = (SELECT id FROM libraries WHERE path = ?)`, path,
	); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM libraries WHERE path = ?`, path); err != nil {
		return err
	}
	return tx.Commit()
}

// SetLibraryOrder sets the sort_order for each path in the provided slice.
// Paths not in the slice retain their existing sort_order.
func (db *DB) SetLibraryOrder(paths []string) error {
	tx, err := db.conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	for i, p := range paths {
		if _, err := tx.Exec(`UPDATE libraries SET sort_order = ? WHERE path = ?`, i, p); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// MigrateLibrariesFromConfig inserts any paths from config.json that are not
// yet present in the libraries table. This is idempotent and safe to call on
// every application launch.
func (db *DB) MigrateLibrariesFromConfig(paths []string) error {
	if len(paths) == 0 {
		return nil
	}
	tx, err := db.conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(libraryInsert)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, p := range paths {
		if _, err := stmt.Exec(p); err != nil {
			return fmt.Errorf("migrate library %q: %w", p, err)
		}
	}
	return tx.Commit()
}

// ── Package repository ────────────────────────────────────────────────────────

// packageUpsert inserts a physical-file row, or updates it in place when a file
// already exists at the same (library_id, rel_path). All scanner-derived fields
// are refreshed on conflict. The surrogate id is never touched.
const packageUpsert = `
	INSERT INTO packages (
		library_id, rel_path, file_name, size_bytes, is_enabled, is_corrupt,
		package_key, family, creator, package_name, version, description,
		license_type, type, categories, tags, thumbnail_path, creation_date, scanned_at
	) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
	ON CONFLICT(library_id, rel_path) DO UPDATE SET
		file_name      = excluded.file_name,
		size_bytes     = excluded.size_bytes,
		is_enabled     = excluded.is_enabled,
		is_corrupt     = excluded.is_corrupt,
		package_key    = excluded.package_key,
		family         = excluded.family,
		creator        = excluded.creator,
		package_name   = excluded.package_name,
		version        = excluded.version,
		description    = excluded.description,
		license_type   = excluded.license_type,
		type           = excluded.type,
		categories     = excluded.categories,
		tags           = excluded.tags,
		thumbnail_path = excluded.thumbnail_path,
		creation_date  = excluded.creation_date,
		scanned_at     = excluded.scanned_at
`

func packageUpsertArgs(p PackageRow) []any {
	return []any{
		p.LibraryID, p.RelPath, p.FileName, p.SizeBytes, p.IsEnabled, p.IsCorrupt,
		p.PackageKey, p.Family, p.Creator, p.PackageName, p.Version, p.Description,
		p.LicenseType, p.Type, p.CategoriesJSON, p.TagsJSON, p.ThumbnailPath,
		p.CreationDate, p.ScannedAt,
	}
}

// UpsertPackage inserts or updates a single physical-file row, keyed by
// (library_id, rel_path).
func (db *DB) UpsertPackage(p PackageRow) error {
	_, err := db.conn.Exec(packageUpsert, packageUpsertArgs(p)...)
	return err
}

// UpsertPackages upserts a batch of packages inside a single transaction.
// This is significantly faster than N individual UpsertPackage calls.
func (db *DB) UpsertPackages(packages []PackageRow) error {
	if len(packages) == 0 {
		return nil
	}

	tx, err := db.conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(packageUpsert)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, p := range packages {
		if _, err := stmt.Exec(packageUpsertArgs(p)...); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// DeletePackagesOlderThan removes rows for the given library whose scanned_at
// is strictly older than `since` — i.e. files that were not touched by the
// current scan because they no longer exist on disk.
//
// Usage: record scanStart := database.Now() before the scan begins, upsert
// every discovered package with scanned_at = Now(), then call this to prune.
// The per-library predicate avoids the IN-clause size limit of a
// NOT IN (all paths) approach and scopes cleanup to the scanned library only.
func (db *DB) DeletePackagesOlderThan(libraryID int64, since int64) error {
	_, err := db.conn.Exec(
		`DELETE FROM packages WHERE library_id = ? AND scanned_at < ?`,
		libraryID, since,
	)
	return err
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Now returns the current Unix timestamp in seconds.
func Now() int64 {
	return time.Now().Unix()
}
