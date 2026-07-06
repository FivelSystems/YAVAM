# Design: SQLite data model

> **Status:** Foundational — partly shipped (1.4.0-dev).
> **Roadmap:** [SQLite foundation](../roadmap/sqlite-foundation.md).
> **Authoritative source:** the migrations in `pkg/database/migration.go` are the
> real, shipped schema. This document is the design intent behind them. Migrations
> are **append-only and forward-only** — never edit an existing migration, only add
> one.

## Role of the database

SQLite is an **index/cache**, not the source of truth. It is rebuilt from disk
scans, plus a small amount of genuinely new data (ratings, favourites, notes) that
exists nowhere else.

- `config.json` remains the source of truth for configured library paths and
  host-level settings. Library paths are mirrored *from* `config.json` into the DB
  on launch, so a build predating the DB still works off `config.json`.
- Only genuinely new, user-authored data (ratings, favourites, notes, hidden flag)
  originates in the DB.

## Driver

`modernc.org/sqlite` — pure Go, no CGO, no MinGW. This keeps the Scoop-only,
CGO-free build chain intact.

## Target schema

```sql
CREATE TABLE packages (
  id             TEXT PRIMARY KEY,   -- "Creator.PackageName.Version"
  family         TEXT NOT NULL,      -- "Creator.PackageName"
  file_path      TEXT NOT NULL,
  library_path   TEXT NOT NULL,
  file_name      TEXT NOT NULL,
  size_bytes     INTEGER NOT NULL,
  is_enabled     BOOLEAN NOT NULL DEFAULT 1,
  is_corrupt     BOOLEAN NOT NULL DEFAULT 0,
  is_hidden      BOOLEAN NOT NULL DEFAULT 0,  -- user-set; never touched by scanner
  creator        TEXT,
  package_name   TEXT,
  version        TEXT,
  description    TEXT,
  license_type   TEXT,               -- "CC BY", "PC", etc.
  type           TEXT,
  categories     TEXT,               -- JSON array
  tags           TEXT,               -- JSON array
  thumbnail_path TEXT,               -- AppData/YAVAM thumbnail cache path
  creation_date  TEXT,
  scanned_at     INTEGER NOT NULL
);

CREATE TABLE user_metadata (
  family        TEXT PRIMARY KEY,    -- "Creator.PackageName" (version-agnostic)
  rating        INTEGER CHECK(rating BETWEEN 0 AND 5) DEFAULT 0,
  is_favorite   BOOLEAN NOT NULL DEFAULT 0,
  notes         TEXT,
  custom_tags   TEXT,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE dependencies (
  dependent_id   TEXT NOT NULL,
  dependency_id  TEXT NOT NULL,
  is_resolved    BOOLEAN NOT NULL DEFAULT 0,
  PRIMARY KEY (dependent_id, dependency_id)
);

CREATE TABLE hub_index (
  file_name    TEXT PRIMARY KEY,     -- "Creator.Package.1.var"
  resource_id  INTEGER NOT NULL,
  cached_at    INTEGER NOT NULL
);

CREATE TABLE libraries (
  path            TEXT PRIMARY KEY,
  label           TEXT,
  password_hash   TEXT,
  is_public       BOOLEAN NOT NULL DEFAULT 1,
  allow_view      BOOLEAN NOT NULL DEFAULT 1,   -- remote clients can browse/scan
  allow_write     BOOLEAN NOT NULL DEFAULT 0,   -- remote clients can toggle/delete/upload
  allow_download  BOOLEAN NOT NULL DEFAULT 1,   -- remote clients can download single .var files
  allow_bulk_dl   BOOLEAN NOT NULL DEFAULT 0,   -- remote clients can download ZIP bundles
  bundle_limit_enabled  BOOLEAN NOT NULL DEFAULT 1,
  bundle_max_packages   INTEGER NOT NULL DEFAULT 50,
  bundle_count_deps     BOOLEAN NOT NULL DEFAULT 1,
  sort_order      INTEGER NOT NULL DEFAULT 0
);

-- One pocket per session (session_id = SHA256(auth_token), or "desktop" locally)
CREATE TABLE pockets (
  session_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

CREATE TABLE pocket_items (
  session_id   TEXT NOT NULL REFERENCES pockets(session_id) ON DELETE CASCADE,
  package_id   TEXT NOT NULL,       -- "Creator.PackageName.Version"
  library_path TEXT NOT NULL,
  added_at     INTEGER NOT NULL,
  PRIMARY KEY (session_id, package_id)
);

CREATE TABLE ui_layout (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL               -- JSON blob (icon order, panel layout)
);
```

## Re-scan strategy

The scanner **`UPDATE`s** existing rows in `packages`; it never does
`DELETE + INSERT`. This preserves user-set flags (`is_hidden`, ratings, favourites)
across re-scans. New packages are `INSERT`ed with defaults. Files no longer present
on disk are `DELETE`d — no ghost records.

## config.json vs DB split

Only host/system settings live in `config.json` (server port, auth interval, setup
done, last-seen version). Everything derived from disk plus user metadata lives in
the DB. Per-device view preferences (grid size, sort, dependency-visibility mode)
live in `localStorage` on the client, not here.

## Current implementation notes (deviations from the target above)

The shipped 1.4.0-dev schema evolved past the original design in two ways, both
recorded here so the target above is not mistaken for the live schema:

- **Dependencies are family-anchored.** The `dependencies` design keyed edges by
  the versioned `dependency_id`, but VaM dependency strings use `.latest`/pinned
  versions that rarely match the installed copy, so reverse "used by" came up empty.
  The shipped graph (migration v3) stores a `dependency_family` (`creator.name`)
  matching key and resolves satisfaction globally across all libraries. See
  `pkg/services/library/dependency_graph.go`.
- **Path casing** is normalised via a `path_norm` column (migration v2) and the
  single canonical helper `utils.CanonPath` (`pkg/utils/path.go`), so
  library↔package association is case-insensitive while display casing is preserved.
