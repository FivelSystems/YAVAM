# Design: Pocket system + unified action modal

> **Status:** Design — not yet implemented.
> **Roadmap:** [Pocket system](../roadmap/pockets.md),
> with the cleanup feeder from [Hub integration + cleanup](../roadmap/hub-cleanup.md).

A pocket is a curated set of packages (plus optional dependencies) that a bulk
operation runs against. Every bulk action funnels through one modal so execution is
reviewed in a single place.

## Storage — SQLite-backed, session-keyed

Pocket items live in `pocket_items` (see
[database-schema.md](database-schema.md)), not in memory: whole libraries can be
added — thousands of packages — so an in-memory pocket would be too heavy. React
renders only visible rows via virtual scrolling; backend queries are paginated.

Each authenticated session owns its own pocket row, keyed by
`session_id = SHA256(auth_token)`. The desktop client uses a fixed
`session_id = "desktop"`. Concurrent web clients cannot read or write each other's
pocket.

Lifecycle:
- **Session create:** `INSERT INTO pockets (session_id, created_at)` — no-op if it
  exists.
- **Session revoke:** `DELETE FROM pockets WHERE session_id = ?` — cascades to
  `pocket_items`.
- **Desktop app close:** clears the `"desktop"` pocket for a clean next launch.

## Deduplication rule

`package_id` (`Creator.PackageName.Version`) is the primary key per session, so a
package appears at most once per pocket. Adding the same package from a **different
library** updates `library_path` and fires a toast:
_"Package already in pocket from [old library] — replaced with [new library]."_

## Frontend context

`PocketContext` (context level 4) wraps `pocket_items` filtered by the current
session's `session_id`.

## Unified action modal

### Left panel

- Mode dropdown: `Enable | Disable | Delete | Install | Uninstall | Download`.
  - `Download` is **web-client only** (hidden when `window.go` is present).
  - `Download` is greyed out (tooltip: _"Bulk downloads not allowed for this
    library"_) when the active library's `allow_bulk_dl = false`.
- `[x] Include dependencies` — base toggle, applies to every mode. Dependency
  subtrees are resolved from existing scan metadata; no additional scan runs.
- Mode-specific options:
  - **Enable:** `On collision: Ignore / Overwrite`.
  - **Disable:** `If used by others outside pocket: Ignore / Include`.
  - **Delete / Uninstall:** `If used by others outside pocket: Ignore / Include`
    (Uninstall defaults to Include).
  - **Install:** `On collision: Ignore / Overwrite` · target-library dropdown ·
    `[Scan target for deps]`.
  - **Download** *(web only):* editable bundle-name field (default
    `yavam-bundle-YYYY-MM-DD.zip`); live counter
    `"N selected + M deps = T total (limit: L)"` that turns red and disables submit
    when `T > L` (shown only when `bundle_limit_enabled = true`); submit posts to
    `/api/bundle` and the browser downloads the ZIP. The include-dependencies toggle
    controls both whether deps are bundled and whether they count toward the limit.

### Right panel — preview list

- One `<PackageCard layout="dependency">` per row.
- Colour coding: 🟢 enable · ⚫ disable · 🔴 delete · 🔵 install · 🟡 skip.
- Dependency subtree (indented) shows only when Include dependencies is ON.
- Per-row toggle; Shift+click toggles all children recursively.
- Stats footer: package count, size delta (± GB); contextual tip bar.

### Hotkeys (registered in KeybindContext, all remappable)

`T` toggle · `I` install (opens modal in Install mode) · `Shift+I` uninstall ·
`A` add to pocket · `Shift+A` remove from pocket.

### Context-menu bridge

Right-click actions remain but become "quick-configure + open the pocket modal"
shortcuts. They never execute directly — the modal is always the confirmation step.

## Cleanup feeder (Hub integration + cleanup)

The Library Cleanup view is a **pocket feeder**: it analyses a library and produces
a plan, then loads that plan into the active pocket. It never executes directly, so
all execution stays in the one modal above.

```
[🧹 icon] → [Cleanup view: configure] → [Analyze Library]
         → [Unified result list: review/toggle] → [Load into Pocket] → [Pocket modal]
```

Analysis categories (each a collapsible section with an enable toggle):

| Section | Default | Options |
|---|---|---|
| Merge Duplicates | on | Auto-pick enabled · Auto-pick largest · Manual per group |
| Fix Obsoletes | on | Keep latest only · Delete all old · Pick per-package |
| Clear Available Online | on | Hub connection required; always delete |
| Clean Corrupt | on | Delete · Disable · Ignore (Hide, file untouched) |

Result rows carry a reason label (`"Exact duplicate of X"`, `"Older than v15"`,
`"Available on Hub"`, `"Corrupt archive"`) and a proposed-action badge. A stats bar
updates live as rows are toggled. `VersionResolutionModal.tsx` logic is reused
(extended to batch) for Merge Duplicates rendering.

**Clear Available Online safety gate — enforced backend-side regardless of frontend
state:** packages with `license_type IN ('PC', 'PC EA')` are never included, and
`hubDownloadable = false` packages are shown as "Open in Browser" only, never
deletable.
