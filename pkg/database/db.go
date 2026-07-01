package database

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	"yavam/pkg/utils"

	_ "modernc.org/sqlite" // registers the "sqlite" driver
)

// querier is satisfied by both *sql.DB and *sql.Tx, letting the library
// upsert logic run either standalone or inside a caller's transaction.
type querier interface {
	Exec(query string, args ...any) (sql.Result, error)
	QueryRow(query string, args ...any) *sql.Row
}

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
	// Repair/backfill path_norm using the same CanonPath used for lookups, and
	// collapse any casing-variant duplicate library rows left by older builds.
	if err := db.reconcilePathNorm(); err != nil {
		conn.Close()
		return nil, fmt.Errorf("database: reconcile path_norm: %w", err)
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

// libraryInsert inserts a library with default permissions and the next
// sort_order. Params: (path, path_norm). Casing-variant uniqueness is enforced by
// ensureLibrary, not here.
const libraryInsert = `
	INSERT INTO libraries (path, path_norm, label, is_public, allow_view, allow_write,
	                       allow_download, allow_bulk_dl, bundle_limit_enabled,
	                       bundle_max_packages, bundle_count_deps, sort_order)
	VALUES (?, ?, '', 1, 1, 0, 1, 0, 1, 50, 1,
	        (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM libraries))
	ON CONFLICT(path) DO NOTHING
`

// ensureLibrary returns the surrogate id of the library at path, inserting it
// (original casing preserved for display) only if no row shares its canonical
// path_norm. Runs standalone or inside a caller's transaction via querier.
func ensureLibrary(q querier, path string) (int64, error) {
	norm := utils.CanonPath(path)

	var id int64
	err := q.QueryRow(`SELECT id FROM libraries WHERE path_norm = ?`, norm).Scan(&id)
	if err == nil {
		return id, nil
	}
	if err != sql.ErrNoRows {
		return 0, err
	}

	if _, err := q.Exec(libraryInsert, path, norm); err != nil {
		return 0, err
	}
	if err := q.QueryRow(`SELECT id FROM libraries WHERE path_norm = ?`, norm).Scan(&id); err != nil {
		return 0, err
	}
	return id, nil
}

// reconcilePathNorm backfills path_norm with CanonPath (the same function used
// for lookups, so keys can't drift) and drops casing-variant duplicate rows left
// by older builds. Runs once per Open, after migrations.
func (db *DB) reconcilePathNorm() error {
	rows, err := db.conn.Query(`SELECT id, path, path_norm FROM libraries ORDER BY id ASC`)
	if err != nil {
		return err
	}
	type lib struct {
		id   int64
		path string
		norm string
	}
	var all []lib
	for rows.Next() {
		var l lib
		if err := rows.Scan(&l.id, &l.path, &l.norm); err != nil {
			rows.Close()
			return err
		}
		all = append(all, l)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close() // must close before mutating on the single-connection pool

	seen := make(map[string]bool, len(all))
	for _, l := range all {
		want := utils.CanonPath(l.path)
		if seen[want] {
			if _, err := db.conn.Exec(`DELETE FROM libraries WHERE id = ?`, l.id); err != nil {
				return err
			}
			continue
		}
		seen[want] = true
		if l.norm != want {
			if _, err := db.conn.Exec(`UPDATE libraries SET path_norm = ? WHERE id = ?`, want, l.id); err != nil {
				return err
			}
		}
	}
	return nil
}

// GetLibraries returns all library rows ordered by sort_order.
func (db *DB) GetLibraries() ([]LibraryRow, error) {
	rows, err := db.conn.Query(`
		SELECT id, path, COALESCE(label, ''), COALESCE(password_hash, ''), is_public,
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

// EnsureLibrary inserts the library at path (with default permissions) if no row
// shares its canonical path, and returns its surrogate id. Idempotent.
func (db *DB) EnsureLibrary(path string) (int64, error) {
	return ensureLibrary(db.conn, path)
}

// UpsertLibrary inserts a library at path with default permissions,
// or does nothing if a row with the same canonical path already exists.
func (db *DB) UpsertLibrary(path string) error {
	_, err := ensureLibrary(db.conn, path)
	return err
}

// DeleteLibrary removes a library and all package rows belonging to it.
// Matched by canonical path so a casing-variant argument still deletes the row.
func (db *DB) DeleteLibrary(path string) error {
	norm := utils.CanonPath(path)

	tx, err := db.conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(
		`DELETE FROM packages WHERE library_id = (SELECT id FROM libraries WHERE path_norm = ?)`, norm,
	); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM libraries WHERE path_norm = ?`, norm); err != nil {
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
		if _, err := tx.Exec(`UPDATE libraries SET sort_order = ? WHERE path_norm = ?`, i, utils.CanonPath(p)); err != nil {
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

	for _, p := range paths {
		if _, err := ensureLibrary(tx, p); err != nil {
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

// GetPackagesByLibraryPath returns every package row for the library at path
// (matched canonically), ordered by rel_path. Read side of the cache-first grid.
func (db *DB) GetPackagesByLibraryPath(path string) ([]PackageRow, error) {
	norm := utils.CanonPath(path)
	rows, err := db.conn.Query(`
		SELECT p.id, p.library_id, p.rel_path, p.file_name, p.size_bytes, p.is_enabled,
		       p.is_corrupt, p.package_key, p.family, p.creator, p.package_name, p.version,
		       p.description, p.license_type, p.type, p.categories, p.tags, p.thumbnail_path,
		       p.creation_date, p.scanned_at
		FROM packages p
		JOIN libraries l ON p.library_id = l.id
		WHERE l.path_norm = ?
		ORDER BY p.rel_path ASC
	`, norm)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []PackageRow
	for rows.Next() {
		var p PackageRow
		if err := rows.Scan(
			&p.ID, &p.LibraryID, &p.RelPath, &p.FileName, &p.SizeBytes, &p.IsEnabled,
			&p.IsCorrupt, &p.PackageKey, &p.Family, &p.Creator, &p.PackageName, &p.Version,
			&p.Description, &p.LicenseType, &p.Type, &p.CategoriesJSON, &p.TagsJSON, &p.ThumbnailPath,
			&p.CreationDate, &p.ScannedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// ── Dependency repository ───────────────────────────────────────────────────────

// ReplaceDependencies refreshes the dependency graph for one scan: it clears
// edges for the given dependent keys, then inserts rows. Scoping the delete to
// the scanned library's keys keeps the global graph consistent across
// per-library scans, since a package's dependency list is identical wherever it
// lives. Reverse lookups ("what depends on X") use idx_dependencies_dep_family.
func (db *DB) ReplaceDependencies(dependentKeys []string, rows []DependencyRow) error {
	if len(dependentKeys) == 0 && len(rows) == 0 {
		return nil
	}

	tx, err := db.conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	del, err := tx.Prepare(`DELETE FROM dependencies WHERE dependent_key = ?`)
	if err != nil {
		return err
	}
	for _, k := range dependentKeys {
		if _, err := del.Exec(k); err != nil {
			del.Close()
			return err
		}
	}
	del.Close()

	// OR REPLACE tolerates a package listing the same dependency twice (the PK).
	ins, err := tx.Prepare(`INSERT OR REPLACE INTO dependencies (dependent_key, dependent_family, dependency_declared, dependency_family) VALUES (?,?,?,?)`)
	if err != nil {
		return err
	}
	for _, r := range rows {
		if _, err := ins.Exec(r.DependentKey, r.DependentFamily, r.DependencyDeclared, r.DependencyFamily); err != nil {
			ins.Close()
			return err
		}
	}
	ins.Close()

	return tx.Commit()
}

// GetPresentFamilies returns the set of package families ("creator.name",
// lower-cased) that exist in ANY library. A dependency is considered resolved
// iff its family is in this set — the cross-library resolution rule.
func (db *DB) GetPresentFamilies() (map[string]bool, error) {
	rows, err := db.conn.Query(`SELECT DISTINCT LOWER(family) FROM packages WHERE family <> ''`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make(map[string]bool)
	for rows.Next() {
		var f string
		if err := rows.Scan(&f); err != nil {
			return nil, err
		}
		out[f] = true
	}
	return out, rows.Err()
}

// GetReverseDependencyFamilies returns, for each dependency family, the distinct
// dependent families that require it — the "used by" graph, version-agnostic and
// spanning all libraries.
func (db *DB) GetReverseDependencyFamilies() (map[string][]string, error) {
	rows, err := db.conn.Query(`SELECT DISTINCT dependency_family, dependent_family FROM dependencies`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make(map[string][]string)
	for rows.Next() {
		var dependency, dependent string
		if err := rows.Scan(&dependency, &dependent); err != nil {
			return nil, err
		}
		out[dependency] = append(out[dependency], dependent)
	}
	return out, rows.Err()
}

// FindPackagesByFamilies returns every physical package whose (lower-cased)
// family is in families, joined to the library that holds it. This is the
// cross-library lookup behind "click a dependency → jump to its library".
func (db *DB) FindPackagesByFamilies(families []string) ([]PackageLocation, error) {
	if len(families) == 0 {
		return nil, nil
	}

	var out []PackageLocation
	// Chunk to stay under SQLite's bound-parameter limit.
	const chunk = 400
	for start := 0; start < len(families); start += chunk {
		end := start + chunk
		if end > len(families) {
			end = len(families)
		}
		batch := families[start:end]

		placeholders := make([]string, len(batch))
		args := make([]any, len(batch))
		for i, f := range batch {
			placeholders[i] = "?"
			args[i] = f
		}
		query := `
			SELECT LOWER(p.family), l.path, p.rel_path, p.file_name,
			       p.creator, p.package_name, p.version, p.is_enabled
			FROM packages p
			JOIN libraries l ON p.library_id = l.id
			WHERE LOWER(p.family) IN (` + strings.Join(placeholders, ",") + `)`

		rows, err := db.conn.Query(query, args...)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var loc PackageLocation
			if err := rows.Scan(&loc.Family, &loc.LibraryPath, &loc.RelPath, &loc.FileName,
				&loc.Creator, &loc.PackageName, &loc.Version, &loc.IsEnabled); err != nil {
				rows.Close()
				return nil, err
			}
			out = append(out, loc)
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		rows.Close()
	}
	return out, nil
}

// GetDeclaredDependencies returns each dependent package's raw declared
// dependency ids, keyed by dependent_key. Used to rebuild Meta.Dependencies when
// reconstructing packages for the cached grid.
func (db *DB) GetDeclaredDependencies() (map[string][]string, error) {
	rows, err := db.conn.Query(`SELECT dependent_key, dependency_declared FROM dependencies`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make(map[string][]string)
	for rows.Next() {
		var key, declared string
		if err := rows.Scan(&key, &declared); err != nil {
			return nil, err
		}
		out[key] = append(out[key], declared)
	}
	return out, rows.Err()
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Now returns the current Unix timestamp in seconds.
func Now() int64 {
	return time.Now().Unix()
}
