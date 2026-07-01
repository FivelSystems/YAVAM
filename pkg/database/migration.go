package database

// migrations is an ordered list of SQL statements that advance the schema
// one version at a time. Each entry corresponds to a PRAGMA user_version bump.
//
// Rules:
//   - NEVER edit an existing migration. Only append new ones.
//   - Each migration must be idempotent when using IF NOT EXISTS / IF EXISTS.
//   - user_version is set to len(migrations) after all pending ones are applied.
var migrations = []string{
	// Version 1 — initial schema
	`
-- A configured library folder. Identified by a stable surrogate id so the
-- on-disk path can change (drive letter, remount, move) without breaking any
-- references. The path is unique but is NOT the key.
CREATE TABLE IF NOT EXISTS libraries (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  path                  TEXT UNIQUE NOT NULL,
  label                 TEXT,
  password_hash         TEXT,
  is_public             BOOLEAN NOT NULL DEFAULT 1,
  allow_view            BOOLEAN NOT NULL DEFAULT 1,
  allow_write           BOOLEAN NOT NULL DEFAULT 0,
  allow_download        BOOLEAN NOT NULL DEFAULT 1,
  allow_bulk_dl         BOOLEAN NOT NULL DEFAULT 0,
  bundle_limit_enabled  BOOLEAN NOT NULL DEFAULT 1,
  bundle_max_packages   INTEGER NOT NULL DEFAULT 50,
  bundle_count_deps     BOOLEAN NOT NULL DEFAULT 1,
  sort_order            INTEGER NOT NULL DEFAULT 0
);

-- One row per physical .var file on disk. The logical package identity
-- (Creator.Name.Version) is stored as the indexed, NON-unique package_key —
-- the SAME package may legitimately appear multiple times:
--   * in different libraries (different library_id), and
--   * within the same library at different folders (same library_id, different rel_path).
-- Both are required by duplicate/obsolete detection, so identity is never the key.
--
-- rel_path is stored CANONICALLY: relative to the library root and without the
-- ".disabled" suffix. Enable/disable is tracked by is_enabled, so toggling a
-- package (which renames the file on disk) never changes the row's identity key.
-- The absolute path is derived on read as libraries.path + rel_path.
CREATE TABLE IF NOT EXISTS packages (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  library_id     INTEGER NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
  rel_path       TEXT    NOT NULL,
  file_name      TEXT    NOT NULL,
  size_bytes     INTEGER NOT NULL,
  is_enabled     BOOLEAN NOT NULL DEFAULT 1,
  is_corrupt     BOOLEAN NOT NULL DEFAULT 0,
  package_key    TEXT,
  family         TEXT,
  creator        TEXT,
  package_name   TEXT,
  version        TEXT,
  description    TEXT,
  license_type   TEXT,
  type           TEXT,
  categories     TEXT,
  tags           TEXT,
  thumbnail_path TEXT,
  creation_date  TEXT,
  scanned_at     INTEGER NOT NULL,
  UNIQUE (library_id, rel_path)
);

CREATE INDEX IF NOT EXISTS idx_packages_library ON packages(library_id);
CREATE INDEX IF NOT EXISTS idx_packages_key     ON packages(package_key);
CREATE INDEX IF NOT EXISTS idx_packages_family  ON packages(family);

-- User ratings/favorites/notes, version-agnostic (keyed by Creator.Name family).
CREATE TABLE IF NOT EXISTS user_metadata (
  family        TEXT PRIMARY KEY,
  rating        INTEGER CHECK(rating BETWEEN 0 AND 5) DEFAULT 0,
  is_favorite   BOOLEAN NOT NULL DEFAULT 0,
  notes         TEXT,
  custom_tags   TEXT,
  updated_at    INTEGER NOT NULL
);

-- Explicit dependency graph (populated in a future phase). Keyed by the
-- logical package identity string (Creator.Name.Version), not a file id.
CREATE TABLE IF NOT EXISTS dependencies (
  dependent_key  TEXT NOT NULL,
  dependency_key TEXT NOT NULL,
  is_resolved    BOOLEAN NOT NULL DEFAULT 0,
  PRIMARY KEY (dependent_key, dependency_key)
);

-- VaM Hub API cache (Phase 7).
CREATE TABLE IF NOT EXISTS hub_index (
  file_name    TEXT PRIMARY KEY,
  resource_id  INTEGER NOT NULL,
  cached_at    INTEGER NOT NULL
);

-- Pocket system (Phase 6). One pocket per authenticated session.
CREATE TABLE IF NOT EXISTS pockets (
  session_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pocket_items (
  session_id   TEXT    NOT NULL REFERENCES pockets(session_id) ON DELETE CASCADE,
  package_id   INTEGER NOT NULL,
  added_at     INTEGER NOT NULL,
  PRIMARY KEY (session_id, package_id)
);

-- JSON blobs for icon order, panel layout (Phase 4+).
CREATE TABLE IF NOT EXISTS ui_layout (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`,
	// Version 2 — path canonicalization + dependency reverse index.
	//
	// path_norm is a library's case-insensitive matching key (utils.CanonPath);
	// libraries.path keeps original casing for display/filesystem access. The index
	// is for lookup speed only — uniqueness is enforced in Go, and rows are
	// backfilled by DB.reconcilePathNorm with the same CanonPath, so no constraint
	// can trip on pre-existing casing duplicates. idx_dependencies_dependency serves
	// reverse "what depends on X" lookups (the PK only serves forward lookups).
	`
ALTER TABLE libraries ADD COLUMN path_norm TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_libraries_path_norm    ON libraries(path_norm);
CREATE INDEX IF NOT EXISTS idx_dependencies_dependency ON dependencies(dependency_key);
`,
	// Version 3 — family-anchored dependency graph.
	//
	// The v1/v2 shape linked on the versioned key (dependency_key), so reverse
	// "used by" lookups failed whenever a dependency was declared as `.latest` or
	// a version other than the installed copy (GitHub #45). The graph now links on
	// FAMILY ("Creator.Name"): dependency_family is the matching key for reverse
	// lookups, dependency_declared is kept only for display, and resolution is
	// derived globally at read time (no stored is_resolved). The table is a pure
	// derived cache, so it is dropped and rebuilt on the next scan of each library.
	`
DROP TABLE IF EXISTS dependencies;
CREATE TABLE dependencies (
  dependent_key       TEXT NOT NULL,
  dependent_family    TEXT NOT NULL,
  dependency_declared TEXT NOT NULL,
  dependency_family   TEXT NOT NULL,
  PRIMARY KEY (dependent_key, dependency_declared)
);
CREATE INDEX idx_dependencies_dep_family ON dependencies(dependency_family);
CREATE INDEX idx_dependencies_dependent  ON dependencies(dependent_key);
`,
}
