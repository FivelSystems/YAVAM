# YAVAM Database Layer (`pkg/database/`)

> **Phase:** 2.1 (v1.4.0) — foundational  
> **Driver:** `modernc.org/sqlite` v1.51+ — pure Go, no CGO, no MinGW  
> **File:** `%AppData%\YAVAM\yavam.db`

---

## Schema Overview

```sql
libraries       -- one row per configured library; surrogate id, path is unique
packages        -- one row per physical .var file (scanner-owned)
user_metadata   -- user ratings, favorites, notes (per Creator.Name family)
dependencies    -- explicit dep graph (populated in future phases)
hub_index       -- VaM Hub API cache (Hub integration)
pockets         -- one row per authenticated session (pocket system)
pocket_items    -- packages added to a pocket (pocket system)
ui_layout       -- JSON blobs for icon order, panel layout (smart search+)
```

Full DDL is in [`migration.go`](../../pkg/database/migration.go).

---

## Package Identity: Logical vs Physical

The `packages` table stores **one row per physical `.var` file on disk**, keyed
by a surrogate `id`. The logical package identity — `Creator.Name.Version` — is
stored as the indexed, **non-unique** `package_key`. This is deliberate: the same
package legitimately appears in multiple places, and duplicate/obsolete detection
depends on being able to represent that.

| Scenario | Representation |
|---|---|
| Deeply nested file | `rel_path = "Looks/Sub/Deep/Foo.1.var"` (arbitrary depth) |
| Same package, same library, different folders | Two rows: same `library_id`, different `rel_path` |
| Same package, different libraries | Two rows: different `library_id` |
| Exact-duplicate detection | `GROUP BY package_key HAVING COUNT(*) > 1` |
| Obsolete (older-version) detection | `GROUP BY family`, compare versions |

The natural key is **`(library_id, rel_path)`** — enforced `UNIQUE`. There is no
separate path/library pair that can drift: both are columns of the same row.

### Paths are relative and canonical
- `rel_path` is stored **relative to the library root** — the absolute path is
  derived on read as `libraries.path || '/' || rel_path`. Moving/remounting a
  library only updates one `libraries.path` row; no per-file migration.
- `rel_path`/`file_name` are stored **without the `.disabled` suffix**, with
  `is_enabled` carrying the state. Toggling a package (a rename on disk) flips a
  boolean and never changes the row's identity key.

### Libraries use a surrogate id
`libraries.id` (autoincrement) is the stable key; `path` is `UNIQUE NOT NULL` but
may change on disk. `packages.library_id` is an FK with `ON DELETE CASCADE`.

---

## Migration System

Migrations live in [`migration.go`](../../pkg/database/migration.go) as an ordered
`[]string`. `PRAGMA user_version` tracks the applied count.

### Rules
- **Never edit** an existing migration entry. Only append.
- Every statement must be idempotent (`IF NOT EXISTS` / `IF EXISTS`).
- Each entry advances the version by 1. The version after applying all
  migrations equals `len(migrations)`.

### Adding a migration
```go
// In migration.go, append to the migrations slice:
var migrations = []string{
    // version 1 — initial schema (existing)
    `CREATE TABLE IF NOT EXISTS ...`,

    // version 2 — add my_new_table
    `CREATE TABLE IF NOT EXISTS my_new_table (
        id TEXT PRIMARY KEY,
        ...
    );`,
}
```

---

## Re-scan Strategy

> **Rule:** The scanner `UPSERT`s on `(library_id, rel_path)` — **never**
> `DELETE + INSERT` for existing files. User metadata (ratings, favorites) lives
> in a separate table keyed by `family` and is never touched by scans.

### Timestamp-based orphan cleanup

```go
libID, _ := db.EnsureLibrary(libraryPath) // resolve the surrogate id once
scanStart := database.Now()               // before the Hard Pass

// After all packages are upserted (each with scanned_at = Now()):
db.DeletePackagesOlderThan(libID, scanStart)
```

Any record for that `library_id` with `scanned_at < scanStart` was not touched by
this scan, meaning the `.var` file no longer exists on disk — the record is
removed. Cleanup is scoped per-library.

### UpsertPackages batch

All packages are collected in memory and flushed in a **single transaction**
after `wg.Wait()` (Hard Pass complete). This is faster than N individual upserts
and avoids locking pressure from 8 concurrent goroutines.

User metadata (`rating`, `is_favorite`, `notes`, `custom_tags`) lives in the
separate `user_metadata` table (keyed by `family`) and is never affected by scans.

---

## Library CRUD

Libraries are managed exclusively through `pkg/manager/Manager`:

```go
m.GetLibraries()            // []string of paths ordered by sort_order
m.AddLibrary(path)          // INSERT with default permissions (no-op if exists)
m.RemoveLibrary(path)       // DELETE library + all its packages
m.SetLibraries([]string)    // SET sort_order for reordering
```

The DB layer resolves a path to its surrogate id via `db.EnsureLibrary(path)
(int64, error)` — used by the scanner to stamp `packages.library_id`. Callers
above stay path-based; `path` is `UNIQUE`, so the mapping is unambiguous.

### One-time migration from config.json

On **first launch** with a DB-enabled binary, `NewManager` runs:

```go
db.MigrateLibrariesFromConfig(cfg.Libraries) // INSERT OR IGNORE all paths
cfg.Update(func(c) { c.Libraries = []string{} }) // zero out config.json
```

This is idempotent — safe to call on every subsequent launch.  
After migration, `config.json` no longer stores the `libraries` array.

---

## Query Patterns

### Get all packages for a library (paginated), with absolute path
```sql
SELECT p.*, l.path || '/' || p.rel_path AS abs_path
FROM packages p
JOIN libraries l ON l.id = p.library_id
WHERE p.library_id = ?
ORDER BY p.creator, p.package_name, p.version
LIMIT ? OFFSET ?;
```

### Find exact duplicates (same logical package, multiple files)
```sql
SELECT package_key, COUNT(*) AS copies
FROM packages
GROUP BY package_key
HAVING copies > 1;
```

### Get user metadata for a family
```sql
SELECT rating, is_favorite, notes
FROM user_metadata
WHERE family = ?;
```

### Get enabled packages missing from hub_index (Hub integration)
```sql
SELECT p.id FROM packages p
LEFT JOIN hub_index h ON h.file_name = p.file_name
WHERE p.is_enabled = 1 AND h.file_name IS NULL;
```

---

## Connection Settings

| Setting | Value | Reason |
|---|---|---|
| Journal mode | `WAL` | Better concurrent read performance |
| Foreign keys | `ON` | Enforces `pocket_items → pockets` CASCADE |
| `MaxOpenConns` | `1` | SQLite has one write lock; cap the pool to avoid "database is locked" |

---

## `categories` and `tags` columns

Stored as JSON arrays (`TEXT`):

```json
["Scene", "Look"]
["dress", "animation"]
```

Use `json_each()` for SQLite-side filtering (smart search):

```sql
SELECT DISTINCT p.id
FROM packages p, json_each(p.tags) t
WHERE t.value = 'dress';
```

---

## config.json vs DB split

| Field | Location | Reason |
|---|---|---|
| `libraries` | DB `libraries` table | Migrated in the SQLite foundation |
| `serverPort` | `config.json` | System-level, affects server startup |
| `serverEnabled` | `config.json` | System-level |
| `authPollInterval` | `config.json` | System-level |
| `setupDone` | `config.json` | Needed before DB is open |
| `lastSeenVersion` | `config.json` | Needed before DB is open |
| `gridSize`, `sortMode` | `localStorage` | Per-client view preference |
| `keybinds` | `config.json` → DB (smart search) | Deferred; entangled with sidebar redesign |

---

## Export / Import

`yavam.db` lives in `DataPath` (`%AppData%\YAVAM\`). `ExportSettings` zips the
entire `DataPath` — the DB is included automatically.

`ImportSettings` validates that the zip contains **either** `config.json` or
`yavam.db` (or both) — older backups only had `config.json`.
