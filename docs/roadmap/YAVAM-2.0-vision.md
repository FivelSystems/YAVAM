# YAVAM 2.0 — Master Roadmap & Vision Document
> **Baseline:** v1.3.18 · **Target:** v2.0.0
> **Last updated:** 2026-05-14
> **Purpose:** Developer guide · Personal roadmap · Prompt reference · Community documentation

---

## Part 1 — What YAVAM Is Today

**Tech stack:** Wails v2 (Go backend) + React 18 / Vite / TypeScript / Tailwind CSS frontend. Portable `.exe`, no installer, no registry. Optional HTTP server for remote web clients.

**Dev prerequisites** (do not change without updating README):
- Go ≥ 1.21 (via Scoop `go`)
- Node.js LTS (via Scoop `nodejs-lts`)
- Wails CLI (`go install github.com/wailsapp/wails/v2/cmd/wails@latest`)
- No CGO, no MinGW — all Go deps must be pure Go.

**Frontend context hierarchy (strict — never break order):**
1. `ToastProvider` + `KeybindProvider`
2. `ServerProvider`
3. `LibraryProvider` + `PackageProvider`
4. `FilterContext` + `SelectionContext`
5. `ActionContext`

**Existing package statuses:** `VALID` · `ROOT` · `MISMATCH` · `DUPLICATE` · `OBSOLETE` · `CORRUPT` · `DISABLED`

**`thumbnail_path`** → yes, points to the AppData/YAVAM thumbnail cache directory (extracted from `.var` zip on first scan, stored by content hash).

---

## Part 2 — Confirmed Architectural Decisions

Answers to all open questions from the previous round:

| Q | Decision |
|---|---|
| Q1 Auto-restart | Use `syscall` (same approach as before — something broke in the call chain, not the strategy). Investigate `pkg/utils/lifecycle.go`. No shell wrappers. |
| Q2 SQLite driver | `modernc.org/sqlite` — pure Go, no CGO, no MinGW. Matches existing Scoop-only prerequisite chain. |
| Q3 Pocket persistence | **SQLite-backed, session-keyed.** Pocket items stored in `pocket_items` table, one pocket per authenticated session (keyed by session token hash). Reason: entire libraries can be added (thousands of packages); in-memory would be too heavy. Virtual scrolling still applies — React renders only visible rows, SQLite is queried with pagination. Desktop client uses a fixed `session_id = "desktop"`. Pocket is cleared when its session ends (revoke or app close). Multiple concurrent web clients each maintain their own independent pocket — no cross-session interference. |
| Q4 Delete vs Uninstall | **Same backend function, different UI label and default parameters.** Both move to Recycle Bin. No code duplication. |
| Q5 Dep resolution in Pocket | Use **existing library scan metadata only** — no additional scans. Show the dependency subtree only when "Include dependencies" toggle is ON. |
| Q6 Creator view animation | **Hover-only** thumbnail carousel (performance). |
| Q7 Unimplemented icons | Show with **"Coming soon" tooltip**, grayed out. |
| Q8 Search syntax | **AND by default across types, OR within same type.** Booru modifiers: bare token = AND, `+token` = OR, `-token` = exclusion. Documented in skill file. |
| Q9 Paid/external Hub links | Show **"Open in Browser"** button (not hidden). |
| Q10 Language switch | **Immediate React context re-render.** No restart. Fallback to restart only if serious issues arise. |
| Q11 CSS themes | **Strict `--yavam-*` custom property whitelist** from the UI color pickers. External `.css` theme files (Catppuccin, Base16) are allowed but only their `--yavam-*` variable definitions are imported — no arbitrary CSS injection. |
| Q12 Split view same library | **Yes**, both panels can show the same library (useful for different filter states). |
| Q13 Pocket add/replace | `A` key always **appends** (no duplicates by path). If the same package from a **different library** is already in the pocket, **replace it with a toast warning** (don't silently ignore). |
| Q14 Rating scope | Per `Creator.PackageName` family — version-agnostic. Rating applies to the "concept" of the package, not a specific version. |
| Q15 Torrent/magnet | **Excluded from v2 scope entirely.** |

---

## Part 3 — Additional Decisions (Follow-Up)

### "Missing file" card color
"Missing file" = a package listed in the DB whose `.var` file no longer exists on disk. When the scanner runs and cannot find a recorded file, it **deletes the DB record immediately**. No ghost records. The card color previously labeled "Missing file" should be renamed **"Missing Dependencies"** — i.e., `missingDeps.length > 0`.

### Pocket system — SQLite-backed, session-keyed
Pocket items are stored in `pocket_items` DB table for performance (whole libraries can be added = thousands of packages). React renders only visible rows via virtual scrolling; backend queries are paginated.

Each authenticated session has its own pocket row, identified by the **SHA256 hash of its auth token** (`session_id`). The desktop client uses a fixed `session_id = "desktop"`. This prevents multiple concurrent web clients from reading and writing each other's pocket state.

Pocket lifecycle:
- **On session create:** `INSERT INTO pockets (session_id, created_at) VALUES (?, ?)` — no-op if already exists.
- **On session revoke:** `DELETE FROM pockets WHERE session_id = ?` — cascades to `pocket_items`.
- **On desktop app close:** `DELETE FROM pockets WHERE session_id = 'desktop'` — clears the active pocket for next launch.

### Library Cleanup view
A new **dedicated sidebar view** (not just a modal) for library optimization, opened via a broom/sparkles icon. Contains three sections:
1. **Merge Duplicates** — resolve exact duplicates; options: merge in-place, merge at library root, pick which copy survives.
2. **Fix Obsoletes** — handle older versions; options: keep latest, delete all old, pick per-package.
3. **Clear Available Online** — delete local copies of packages that are freely downloadable from VaM Hub (confirmed via `findPackages`). Designed for users who want to reclaim HDD space on public/free content, keeping only private/Patreon packages locally. Requires Hub connectivity and shows a preview list before deletion.

The cleanup view is tied to the Hub integration (Phase 5) because "Clear Available Online" requires `findPackages`. Sections 1 and 2 (Merge/Obsoletes) can ship earlier.

### License types in YAVAM
VaM packages carry a `licenseType` in `meta.json` and in Hub API responses. Known values:

| License | Meaning | Hub accessible? |
|---|---|---|
| `CC BY` | Creative Commons Attribution | Yes |
| `CC BY-SA` | CC + ShareAlike | Yes |
| `CC BY-NC` | CC + NonCommercial | Yes (some) |
| `CC BY-NC-SA` | CC + NonCommercial + ShareAlike | Yes (some) |
| `CC BY-ND` | CC + NoDerivatives | Yes |
| `PC` | Purchased Content (Patreon/paid) | No public download |
| `PC EA` | Purchased Content, Early Access | No public download |
| `Questionable` | License unclear | Varies |

**These must be stored in the `packages` table** (`license_type TEXT`). **"Clear Available Online" must never target `PC` or `PC EA` packages** — only free-license content. Filter panel must include license as a filter dimension. Search token: `license:cc-by`, `license:pc`, etc.

---

## Part 4 — SQLite Schema (Revised)

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
  is_hidden      BOOLEAN NOT NULL DEFAULT 0,  -- user-set; never modified by scanner
  creator        TEXT,
  package_name   TEXT,
  version        TEXT,
  description    TEXT,
  license_type   TEXT,               -- NEW: "CC BY", "PC", etc.
  type           TEXT,
  categories     TEXT,               -- JSON array
  tags           TEXT,               -- JSON array
  thumbnail_path TEXT,               -- AppData cache path
  creation_date  TEXT,
  scanned_at     INTEGER NOT NULL
);

CREATE TABLE user_metadata (
  family        TEXT PRIMARY KEY,    -- "Creator.PackageName"
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
  bundle_limit_enabled  BOOLEAN NOT NULL DEFAULT 1,  -- enforce max packages per bundle
  bundle_max_packages   INTEGER NOT NULL DEFAULT 50, -- max packages allowed per bundle
  bundle_count_deps     BOOLEAN NOT NULL DEFAULT 1,  -- dependencies count toward the limit
  sort_order      INTEGER NOT NULL DEFAULT 0
);

-- One pocket per session (session_id = SHA256(auth_token), or "desktop" for the local app)
CREATE TABLE pockets (
  session_id TEXT PRIMARY KEY,  -- not an integer; keyed to auth session
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

**Pockets table is now session-keyed** — each authenticated session (web client or desktop) owns its own pocket row. Pockets are cleared when the owning session is revoked or the app closes. Multiple concurrent clients cannot interfere with each other's pocket.

**Re-scan strategy:** The scanner must `UPDATE` existing rows in `packages`, never `DELETE + INSERT`. This preserves all user-set flags (`is_hidden`, ratings, favorites) across re-scans. New packages are `INSERT`ed with defaults. Files no longer found on disk are `DELETE`d.

**config.json vs DB split** remains as previously defined. Only system-level settings stay in `config.json` (server port, auth interval, setup done, last seen version).

---

## Part 5 — Phase Plan (Revised & Reordered)

> [!IMPORTANT]
> Phase ordering has changed from the previous draft. Card rework is now foundational (Phase 2). Library management follows SQLite (Phase 3). Cleanup view requires Hub (Phase 5+).

```
Phase 1  → v1.3.19   Immediate bug fixes                    LOW RISK
Phase 2  → v1.4.0    SQLite + PackageCard rework (foundational)  MEDIUM
Phase 3  → v1.4.5    Advanced library management UI         MEDIUM (needs Phase 2)
Phase 4  → v1.5.0    Smart search + sidebar redesign        MEDIUM
Phase 5  → v1.6.0    Favorites, ratings, license filter     LOW (needs Phase 2)
Phase 6  → v1.7.0    Pocket system + unified action modal   HIGH
Phase 7  → v1.8.0    VaM Hub + Discover + Cleanup view      MEDIUM
Phase 8  → v1.8.5    i18n / localization                    LOW
Phase 9  → v1.9.0    Appearance themes + custom CSS         MEDIUM
Phase 10 → v2.0.0    Modular layout + split view + graph    HIGH
```

---

### Phase 1 — Immediate Fixes (v1.3.19) ⚡

| # | Item | Ref | Size |
|---|---|---|---|
| 1.1 | Bulk delete path staleness: probe `.var` ↔ `.var.disabled` before erroring | Bug | S |
| 1.2 | All bulk ops return `[]BulkResult{path, status, error}` — no single aggregate error | Bug | S |
| 1.3 | Fix `RestartApp()`: investigate `lifecycle.go`, ensure child process is detached via syscall | #22 | S |
| 1.4 | Right sidebar: RMB on dependency row opens context menu, does not trigger "locate" | #29 | S |
| 1.5 | Content image carousel modal when user clicks a thumbnail in the right sidebar (images only, skip non-image contents) | #27 | M |
| 1.6 | CTRL+C copies selected `.var` file(s) to clipboard — plug into `KeybindContext` | #35 | S |
| 1.7 | Add missing fields to `pkg/models/package.go`: `IsOrphan`, `IsExactDuplicate` (referenced in UI, absent from model) | Debt | S |

---

### Phase 2 — SQLite + Foundational Card Rework (v1.4.0) 🗄️🃏

**Rationale for combining:** Cards need to display rating stars and favorites badge — both require the DB. Doing this together avoids a second card refactor in Phase 5.

| # | Item | Ref | Size |
|---|---|---|---|
| 2.1 | Add `modernc.org/sqlite` dep; create `pkg/database/` service with schema init + migrations | #33 | M |
| 2.2 | Scanner: store all scanned packages in DB; on re-scan delete DB records for missing files | #33 | M |
| 2.3 | Migrate `config.json` → DB on first run (libraries, keybinds); keep config.json for system fields | #33 | M |
| 2.4 | Update Export/Import (zip) to include `yavam.db` | #33 | S |
| 2.5 | Add `license_type` field to scanner + DB | License | S |
| 2.6 | Unified `<PackageCard layout="grid|list|dependency">` component | #4 | L |
| 2.7 | `layout="grid"` — thumbnail card: thumbnail, name, creator, status tint, size, type badge. Nothing else. | | S |
| 2.8 | `layout="list"` — compact row: name, creator, size, status tint. No badges beyond status. | | M |
| 2.9 | `layout="dependency"` — slim single-line row for pocket modal and right sidebar dep lists | | M |
| 2.10 | Add `PocketContext` (Level 4, SQLite-backed) to `AppProviders.tsx`; create session pocket (id=1) on startup, truncate on close | | S |

---

### Phase 3 — Advanced Library Management (v1.4.5) 🔒

**Requires Phase 2** (library settings now live in SQLite).

| # | Item | Ref | Size |
|---|---|---|---|
| 3.1 | Settings > Libraries panel: add/edit/delete/rename libraries | #2 | M |
| 3.2 | Per-library properties UI: label, path, password, public toggle, allow view/write/download/bulk download, bundle limit settings | #2 | M |
| 3.3 | Password is bcrypt-hashed; desktop client = always master (no prompt); web clients prompted on library switch | #2 | M |
| 3.4 | Per-library bundle limit: max packages per bundle (default 50), toggle to count deps toward limit (default on), enable/disable limit entirely (default on) | #3 | S |
| 3.5 | Backend enforces all library permissions on every relevant endpoint: `allow_view` on scan/thumbnail/contents, `allow_write` on toggle/delete/upload/install, `allow_download` on `/files/`, `allow_bulk_dl` on `/api/bundle` | Security | M |

> [!CAUTION]
> This phase changes the security surface. Security Auditor persona required before merge. All library permission flags must be enforced **backend-side** regardless of frontend state — the frontend permission checks are UX only (greying out controls), never the enforcement layer.

---

### Phase 4 — Smart Search + Left Sidebar Redesign (v1.5.0) 🔍

| # | Item | Ref | Size |
|---|---|---|---|
| 4.1 | New icon-only left sidebar; drag-to-reorder icons; order persisted in `ui_layout` DB | #30 | L |
| 4.2 | Booru-style smart searchbar with tokenized autocomplete (see syntax below) | #30 | L |
| 4.3 | Tags available via search only (`tag:dress`); removed from dedicated sidebar section | | M |
| 4.4 | Size range filter (`size:>100mb`, `size:10mb..500mb`) | #32 | S |
| 4.5 | License filter (`license:cc-by`, `license:pc`) | New | S |
| 4.6 | CTRL+click for multi-select within status/creator/type filter groups | #30 | M |
| 4.7 | "Reset all filters" button | #30 | S |
| 4.8 | Creator view mode — grid of `<CreatorCard>` components, one per creator (see spec below) | | L |
| 4.9 | Dependency visibility mode dropdown (see spec below) | New | M |

**`<CreatorCard>` component spec:**
- **Square** — identical dimensions to a `layout="grid"` PackageCard.
- **2×2 thumbnail quadrant** grid inside (4 thumbnails from that creator's packages, chosen by most-recent scan order).
- **Hover-only cycle:** on hover, quadrants cycle through the creator's remaining thumbnails one at a time (CSS animation, no JS timer). Stops when hover ends.
- **Footer:** creator name + total package count badge.
- **Click:** drills into a filtered grid showing only that creator's packages.
- This is a **separate component** (`CreatorCard.tsx`), not a layout variant of `PackageCard`. It is never used outside creator view.


**Left sidebar icons (default order, fully reorderable):**

| Icon | Action | State |
|---|---|---|
| ⚙️ | Open Settings modal | Always |
| 📚 | Library selector / management gateway | Always |
| 📁 | Package grid view (default) | Badge: total count |
| 👤 | Creator view | |
| 🧹 | Library Cleanup view | Phase 7 |
| 🧭 | Discover / Hub browse | Phase 7, "Coming soon" until then |
| 🕸️ | Graph view | Phase 10, "Coming soon" until then |
| 🔍 | Filters panel (status, creator, type, license) | Expands with library |
| ➕ | Add new library | |

**Dependency visibility mode (stored in `localStorage` as a client preference):**

A dropdown in the top toolbar controls which packages appear in the main grid:

| Mode | Label shown | Behaviour |
|---|---|---|
| `auto` | `Packages (auto)` | **Default.** Shows only Standalone packages. Automatically expands to show all packages when the searchbar has input or any filter is active. Reverts to Standalone-only when search and filters are cleared. |
| `packages` | `Packages` | Always shows only Standalone packages. Never auto-expands. User must manually switch to see dependencies. |
| `all` | `All packages` | Always shows everything, including dependencies. |

**Rules:**
- `auto` is the factory default and the recommended state.
- Switching to `packages` or `all` is a deliberate user choice — YAVAM must not override it silently.
- When `auto` has expanded due to search/filter, the dropdown label shows `Packages (auto) — expanded` so the user always knows why they're seeing more.
- `status:standalone` filter token still works in all modes (narrows to Standalone even when `all` is active).
- **Stored in `localStorage`** — this is a per-client view preference, not a library setting.

**Booru search syntax (document in `docs/domain/search-syntax.md`):**

```
token              → AND (must match)
+token             → OR  (at least one must match)
-token             → NOT (exclude)

status:enabled     status:disabled  status:missing  status:corrupt  status:standalone
status:hidden      status:visible
creator:acidbubbles
type:scene
tag:dress
license:cc-by      license:pc       license:pc-ea
rating:>=4
favorite:true
size:>500mb        size:10mb..100mb

Examples:
  creator:callimohu type:scene
  creator:callimohu +creator:picovam -status:corrupt
  tag:dress +tag:clothing license:cc-by
  favorite:true rating:>=3
```

Multiple tokens of the same type → OR (e.g. two `creator:` tokens = packages from either creator). Different types → AND.

---

### Phase 5 — Favorites, Ratings, License Filter (v1.6.0) ⭐

**Requires Phase 2** (SQLite `user_metadata` table + `is_hidden` flag in `packages`).

| # | Item | Ref | Size |
|---|---|---|---|
| 5.1 | Favorite toggle: star button in right sidebar details panel (not on card) | #28 | S |
| 5.2 | Filter by `favorite:true` in smart search | #28 | S |
| 5.3 | Rating: 1–5 star widget in right sidebar details panel (not on card) | #16 | S |
| 5.4 | Filter by `rating:>=N` in smart search | #16 | S |
| 5.5 | License badge in right sidebar details panel next to creator name (not on card) | New | S |
| 5.6 | Filter by `license:X` in smart search | New | S |
| 5.7 | Sort by rating | #16 | S |
| 5.8 | Hide package: sets `is_hidden = true` in DB; file untouched; package disappears from grid | New | S |
| 5.9 | Unhide: via right-click context menu, bulk selection, or `status:hidden` filter view | New | S |
| 5.10 | `H` hotkey — toggle hide/unhide on selected package(s) (register in KeybindContext) | New | S |
| 5.11 | `status:hidden` search token — show only hidden packages for management | New | S |
| 5.12 | `status:visible` search token — explicitly show only non-hidden packages | New | S |

**Rating identity:** keyed to `Creator.PackageName` (family) — version-agnostic. A rating for `AcidBubbles.Timeline` applies to all versions. Stored in `user_metadata.family`.

**Card cleanliness rule:** Ratings, favorites, and license badges do **not** appear on `<PackageCard>` in any layout. They are details-panel-only. Cards show only: thumbnail, name, creator, status tint, size, type badge. This keeps cards scannable at high density.

---

### Phase 6 — Pocket System + Unified Action Modal (v1.7.0) 🎒

**Pocket state:** `PocketContext` wraps SQLite `pocket_items` table, filtered by the current session's `session_id`. Virtual scrolling renders only visible rows. Backend paginates queries. Pocket is cleared when the session ends.

**Deduplication rule:** `package_id` (Creator.PackageName.Version) is the PRIMARY KEY per session — appears at most once per pocket. If the user adds the same package from a **different library**, the `library_path` is updated and a toast fires: _"Package already in pocket from [old library] — replaced with [new library]."_

#### Left panel
- Mode dropdown: `Enable | Disable | Delete | Install | Uninstall | Download`
  - `Download` is **web-client only** — hidden on the desktop client (`window.go` present)
  - `Download` is **greyed out** (with tooltip: _"Bulk downloads not allowed for this library"_) if the active library's `allow_bulk_dl = false`
- `[x] Include dependencies` (base toggle — applies to all modes)
- Mode-specific options:
  - **Enable:** `On collision: Ignore / Overwrite`
  - **Disable:** `If used by others outside pocket: Ignore / Include`
  - **Delete / Uninstall:** `If used by others outside pocket: Ignore / Include` · Uninstall defaults to Include
  - **Install:** `On collision: Ignore / Overwrite` · Target library dropdown · `[Scan target for deps]` button
  - **Download:** *(web-client only)*
    - Bundle name field: text input, autogenerated default (`yavam-bundle-YYYY-MM-DD.zip`), user-editable
    - Live package counter: `"N selected + M deps = T total (limit: L)"` — turns red and disables submit if T > limit
    - Counter only appears when the library's `bundle_limit_enabled = true`
    - Submit: `Download Bundle` → `POST /api/bundle` → browser triggers ZIP download
    - The `include dependencies` base toggle controls both whether deps are bundled AND whether they count toward the limit

#### Right panel (preview list)
- `<PackageCard layout="dependency">` per row
- Color coding: 🟢 enable · ⚫ disable · 🔴 delete · 🔵 install · 🟡 skip
- Show dependency subtree (indented) only when "Include dependencies" is ON — use existing library scan metadata, no additional scan
- Per-row toggle; Shift+click toggles all children recursively
- Stats footer: package count, size delta (± GB)
- Footer tip bar: contextual hints e.g. "Hold Shift to toggle all dependencies"

#### Hotkeys (register in KeybindContext, all remappable)
- `T` — Toggle selected package(s)
- `I` — Install (open Pocket modal, Install mode)
- `Shift+I` — Uninstall
- `A` — Add selected to pocket
- `Shift+A` — Remove selected from pocket

#### Context menu bridge
All right-click actions remain but become "quick-configure + open Pocket modal" shortcuts. They do not perform operations directly — the Pocket modal is always the confirmation step.

---

### Phase 7 — VaM Hub Integration + Discover + Cleanup View (v1.8.0) 🌐🧹

#### 7.1 Missing packages → Hub lookup
- Batch missing dep IDs via `findPackages` (≤50 per request)
- Cache in `hub_index` table; invalidate when `getInfo.last_update` changes
- Right sidebar missing deps list shows per-dep status:
  - ✅ "Available on Hub" + Download button (`hubDownloadable: true`)
  - 🔗 "External link" + "Open in Browser" (redirects to Patreon/MEGA)
  - ❌ "Not on Hub"
- **`PC` / `PC EA` packages are never auto-downloaded** — always show "Open in Browser" for those

#### 7.2 Discover mode (Compass icon)
- Browse Hub via `getResources` with YAVAM's filter UI
- Same card layout as local packages; "Install" replaces "Enable"
- Right sidebar shows Hub metadata (image, description, deps, license)
- Cross-reference badge: "Installed" / "Outdated" / "Not installed"

#### 7.3 External source support

| Source | v2 support |
|---|---|
| VaM Hub | ✅ Full |
| Direct HTTPS URL | ✅ Easy |
| WebDAV / Nextcloud | ✅ Feasible |
| Google Drive / MEGA | ❌ Skipped |
| Torrent / Magnet | ❌ Excluded (out of scope) |

#### 7.4 Library Cleanup view (🧹 icon)

**Architecture:** The cleanup view is a **pocket feeder** — it analyzes the library and produces a plan. It never executes directly. All proposed actions are loaded into the active pocket and executed via the Pocket modal. This keeps execution consistent and reviewed in one place.

```
[🧹 Sidebar icon]
       ↓
[Cleanup view]   ← configure analysis categories + options
       ↓
[Analyze Library]  ← backend scans, categorizes all issues
       ↓
[Unified result list]  ← review per-package proposed actions, toggle on/off
       ↓
[Load into Pocket]  ← pushes plan into pocket_items (dedup rule applies)
       ↓
[Pocket modal]  ← final review + execution (single execution point)
```

**Layout:** Two-column dashboard — not a step-by-step wizard.

**Left panel — Analysis configuration:**
Four collapsible sections, each with an enable toggle and options:

| Section | Default | Options |
|---|---|---|
| Merge Duplicates | ✅ on | Auto-pick enabled copy · Auto-pick largest · Manual per group |
| Fix Obsoletes | ✅ on | Keep latest only · Delete all old · Pick per-package |
| Clear Available Online | ✅ on | (Hub connection required; no options — always delete) |
| Clean Corrupt | ✅ on | Delete · Disable · Ignore (= Hide: sets `is_hidden = true`, file untouched) |

**Right/main panel — Unified result list (after analysis runs):**
- All proposed actions from all four sections in one scrollable list, grouped by category
- Each row: `layout="dependency"` card + reason label + proposed action badge
  - 🔴 Delete · ⚫ Disable · 🟡 Ignore (shown dimmed) · 🔵 Keep (surviving copy in merge)
  - Reason: `"Exact duplicate of X"` · `"Older than v15"` · `"Available on Hub"` · `"Corrupt archive"`
- Per-row toggle to exclude individual packages from the action
- **`VersionResolutionModal.tsx` logic reused** for the Merge Duplicates group rendering (extended to batch)

**Stats bar (always visible, updates as rows are toggled):**
```
Affected: 47 packages  │  Freed: 2.3 GB  │  Delete: 38  │  Disable: 6  │  Ignore: 3
```

**Footer buttons:**
- `Analyze Library` — runs backend scan (replaces right panel with results)
- `Load into Pocket` — pushes all toggled-on rows into `pocket_items`, opens Pocket modal
- `Cancel`

**Clear Available Online safety gate (backend-enforced regardless of frontend state):**
- `license_type IN ('PC', 'PC EA')` → never included, ever
- `hubDownloadable = false` → shown as "Open in Browser" only, not deletable

---



### Phase 8 — i18n / Localization (v1.8.5) 🌍

#### Architecture
- CSV files (`locales/en.csv`, `locales/zh.csv`) — columns: `key,value`
- `//go:embed locales/*.csv` in `pkg/i18n/` — languages compile into the binary
- Frontend i18n React context; language in `localStorage`; fallback to `en`
- Immediate re-render on language change (no restart)
- Key naming: `sidebar.status.enabled`, `modal.pocket.button.submit`, `search.syntax.hint`

#### Adding a language
1. Copy `en.csv` → `xx.csv`
2. Translate values (never change keys)
3. Add locale entry to Settings > Appearance language selector
4. Rebuild — locale embedded automatically
5. GitHub Actions: unaffected (CSV = static assets; binary signature unchanged)

#### i18n Agent Skill (`docs/domain/i18n.md`)
This skill file defines responsibilities:
- **Adding new UI keys:** Every new user-visible string must have a corresponding key in `en.csv` before the PR is merged. The i18n agent scans for hardcoded strings and flags them.
- **Propagation to other locales:** When a new key is added to `en.csv`, the agent adds the same key with an `[UNTRANSLATED]` value placeholder to all other locale CSV files automatically, so the app never crashes on missing keys.
- **Translation review:** Community translators only edit the value column of their locale's CSV. Keys are frozen once published.
- **Escape rules:** No HTML in values. Use `{count}`, `{name}` for placeholders. Double braces `{{` to escape literal brace.

---

### Phase 9 — Appearance & Theme System (v1.9.0) 🎨

#### CSS custom properties (full list)

```css
/* Backgrounds */
--yavam-bg-primary          --yavam-bg-secondary
--yavam-bg-card             --yavam-bg-modal

/* Accents */
--yavam-accent              --yavam-accent-secondary

/* Text */
--yavam-text-primary        --yavam-text-secondary
--yavam-text-muted

/* Package card state tints */
--yavam-card-enabled        --yavam-card-disabled
--yavam-card-corrupt        --yavam-card-missing-deps
--yavam-card-duplicate      --yavam-card-obsolete
--yavam-card-standalone     /* = "Standalone" in UI; internal code: isOrphan */

/* UI chrome */
--yavam-creator-label-bg    --yavam-sidebar-icon-active
--yavam-pocket-badge        --yavam-scrollbar
--yavam-border
```

**Built-in themes:** Dark (default), AMOLED, Light, Catppuccin Mocha, Catppuccin Latte, Base16 Ocean.

**External theme files:** Load a community `.css` file (Catppuccin, Base16 official). Only `--yavam-*` definitions are extracted and applied via `element.style.setProperty()`. Arbitrary CSS is ignored — no injection risk.

**Storage:** Active theme name in `localStorage`; custom CSS file path in `ui_layout` DB table.

---

### Phase 10 — Modular Layout + Split View + Graph (v2.0.0) 🧩🕸️

#### Layout system
- Panel types: `LibraryGrid`, `RightSidebar`, `Pocket`, `Graph`, `Discover`, `Cleanup`
- Layout tree persisted in `ui_layout` DB as JSON
- Panels have a visible drag handle zone (not the content area)

#### Split view
- **Optional mode** — default is always single-panel. Toggle via view switcher in toolbar.
- In split mode: two `LibraryGrid` panels side by side, each with its own active library
- Both panels can show the same library (for different filter comparisons)
- Drag-and-drop between panels → triggers Pocket modal pre-configured with Install mode
- Split mode is NOT permanent; user can revert to single view at any time

#### Mobile (desktop-only restrictions)
> [!IMPORTANT]
> **Modular/docker layout and split view are desktop-only features.** They will not be implemented, shimmed, or degraded-gracefully on mobile. Mobile has its own fixed layout.

- Bottom action bar replaces icon sidebar
- Fixed single-panel layout: `LibraryGrid` + `RightSidebar` only
- No panel dragging, no docking, no split view — these UI modes do not exist on mobile
- All library actions remain available via bottom bar and context menus
- Filter/search via bottom bar search button

#### Graph view
- Use `@xyflow/react` — handles 10k+ nodes with viewport virtualization
- Nodes = `<PackageCard layout="dependency">`
- Edges color-coded: resolved=green, missing=red, circular=orange
- Same right-click context menu as main grid
- Pan, zoom, minimap; creator-clustered grouping

---

## Part 6 — Skill Files To Create / Update

| File | Action | Phase |
|---|---|---|
| `docs/domain/i18n.md` | **Create** — i18n agent skill, key conventions, propagation rules | 8 |
| `docs/domain/database.md` | **Create** — SQLite schema, migration guide, query patterns | 2 |
| `docs/domain/search-syntax.md` | **Create** — booru token syntax, full keyword reference | 4 |
| `docs/domain/pocket-system.md` | **Create** — pocket design, bulk action modal spec | 6 |
| `docs/domain/virt-a-mate.md` | **Update** — add license type table, clarify PC/PC EA meaning | 2 |
| `docs/domain/frontend-architecture.md` | **Update** — add PocketContext to hierarchy table | 6 |
| `docs/ROADMAP.md` | **Replace** — point to this document | 1 |
| `docs/SECURITY_AUDIT.md` | **Update** — add Phase 3 library auth notes | 3 |
| `AGENTS.md` | **Update** — add database service rules, i18n agent role | 2 |

---

## Part 7 — All Questions Resolved

All Q1–Q15 and NQ1–NQ5 are now resolved and incorporated above. No open questions remain.

| NQ | Decision |
|---|---|
| NQ1 Merge strategy | Surviving copy = the one the **user selects**; stays in place. All others deleted. |
| NQ2 Clear Available Online scope | Any version present on Hub qualifies, not just if all versions exist there. |
| NQ3 Pocket max size | No hard limit. SQLite-backed (not in-memory) for performance with large libraries. |
| NQ4 Rating on cards | **Details panel only** — never on the card itself. |
| NQ5 License badge | **Details panel only**, next to creator name — never on the card. |
