# Design: Zip bundling

> **Status:** Draft — open decisions listed at the end are unresolved.
> **Roadmap:** on-ramp to the [pocket system](../roadmap/pockets.md).

Bundle a `.var` package — optionally together with its dependencies — into a
single `.zip` for download or transfer, from both the desktop app and remote web
clients. Multiple packages can be bundled at once. YAVAM never writes the archive
to its own disk; it streams it to the destination.

This is an on-ramp to the [pocket system](../roadmap/pockets.md): a pocket is a
curated set of packages plus dependencies, and the same closure-and-stream core
built here is what a pocket export will reuse.

## Goals

- Right-click a package (or a multi-selection) → **Bundle as Zip**.
- Include the selected package(s) and, optionally, their full dependency closure.
- Desktop: user picks the destination via the native save dialog.
- Web client: the archive streams to the browser; nothing is buffered to YAVAM's
  disk and no server-side state is retained.
- One shared core; the desktop and web paths differ only in where the bytes go.

## Architecture

### Single streaming core, two sinks

All zip construction lives in one function that writes to an injected sink:

```go
// pkg/services/library (or pkg/utils if it stays dependency-free)
func BundlePackages(roots []string, includeDeps bool, w io.Writer) error
```

`archive/zip.NewWriter(w)` writes each entry straight to `w` as the source `.var`
files are read, so the archive is never held in memory or spilled to disk. The two
callers wrap the same core:

- **Desktop** — `runtime.SaveFileDialog` returns a path (see the existing
  `App.ExportSettings` in `app.go`, which already does this for the settings
  backup). Open that path as an `*os.File` and pass it as the writer. A cancelled
  or failed write leaves a partial file at a location the user chose.
- **Web** — a new authenticated route, `POST /api/bundle`, passes the
  `http.ResponseWriter` as the writer with
  `Content-Disposition: attachment; filename="…"`. This mirrors the existing
  single-file `/files/` route in `pkg/server/server.go`.

This answers the "do we need two methods?" question from the backlog: the *logic*
is single-sourced (DRY); only the sink differs. The desktop keeps its native save
dialog because an in-webview download gives the user no control over the location
and behaves inconsistently inside Wails — the dialog is a few lines of glue over
the shared core, not a second implementation.

### Dependency closure

`BundlePackages` resolves the transitive dependency set, not just direct
dependencies:

1. Start from each selected package.
2. Resolve its declared dependencies to physical files using the existing
   resolver (`locateDependencies` in
   `pkg/services/library/dependency_graph.go`, which already maps dependency ids
   to the best on-disk copy across all libraries).
3. Recurse into each resolved dependency's own dependencies.
4. Deduplicate by absolute path and guard against cycles.

Missing dependencies (no copy in any library) are recorded and reported back to
the caller rather than silently dropped, so the user learns the bundle is
incomplete.

> **Blocking dependency:** transitive resolution must be correct first. The
> "Sub-Dependencies not behaving as expected" bug (a package showing an
> excessively long, wrong sub-dependency list) has to be fixed and tested before
> this closure can be trusted. See the TODO entry of the same name.

## User-configurable parameters

- **Include dependencies** (`bool`) — bundle the dependency closure alongside the
  selected package(s).
  - Default **ON** when exactly one package is selected (the common "give me this
    look and everything it needs" case).
  - Default **OFF** when multiple packages are selected (the user is more likely
    curating an explicit set and would be surprised by closure bloat).
- **Archive name** — YAVAM generates the name; the user may override it.
  - Single package: `<Creator>.<Name>.<Version>.zip`, suffixed `+deps` when
    dependencies are included.
  - Multiple packages: `YAVAM_Bundle_<count>-packages_<YYYYMMDD-HHMM>.zip`.
  - Desktop: the generated name pre-fills the save dialog, which already lets the
    user rename freely — no extra UI needed.
  - Web: v1 uses the generated name directly. An optional rename field in a small
    pre-download modal can follow once the core ships; it is not required for the
    first cut.

Recommendation: **automated naming with an override**, not a mandatory prompt —
it keeps the one-click path fast while still allowing a custom name.

## Security

- `/api/bundle` sits behind `AuthMiddleware` like every other write/read route.
- Every root path **and** every resolved dependency path is checked with
  `Manager.ValidatePath` before it is opened, so a crafted request cannot pull
  files outside the configured libraries.
- No archive is persisted server-side, so there is no temp file to leak or clean
  up.

## Interruption and resume — trade-off

A dynamically generated zip **cannot** support HTTP range/resume: the bytes do not
exist until they are streamed, so there is nothing to seek into. If a web client's
connection drops, the client retries the whole bundle.

This is an accepted limitation of the "no server disk, no server state" design,
not an oversight. True resumable downloads would require pre-generating and
storing the archive server-side, which contradicts the core goal. v1 ships
streaming-with-retry; resumability is explicitly out of scope.

## Frontend

- Add one **Bundle as Zip** item to `components/ui/ContextMenu.tsx`, next to the
  existing "Install to Library" / "Download File" items, which already branch on
  desktop vs. web (`isWeb = !window.go`).
- Feed the current selection from `context/SelectionContext.tsx` so the item works
  for both single and multi-selection.
- Include-dependencies toggle: a small popover or inline checkbox on the menu item
  for the common case; a full options modal is only needed if more parameters are
  added later.

## Testing

- Backend: closure correctness (transitive, dedup, cycle guard), missing-dependency
  reporting, and that the writer receives a valid zip (open it back with
  `archive/zip.NewReader`).
- Security: `ValidatePath` rejection for out-of-library roots and dependencies.
- Frontend: menu item visibility and default toggle state for single vs. multi
  selection.

## Sequencing / priority

Positioned **after the [smart search bar](../roadmap/search.md)** and **after the
sub-dependency resolution fix**, as the first concrete step toward the
[pocket system](../roadmap/pockets.md) — not "way later," but not before the
closure it depends on is correct.

Rationale:
- The bundle is only as good as its dependency closure; shipping it on top of the
  known sub-dependency bug would produce wrong archives.
- It is a natural precursor to pockets and shares its core, so building it just
  before the pocket system avoids throwaway work.
- It has no dependency on the search/sidebar work, so it slots cleanly after search
  lands without competing for the same surfaces.

## Open decisions to confirm before implementation

1. Naming: accept **automated name + override** as specified, or require a name
   prompt every time?
2. Web override UI: ship without a rename field in v1 (generated name only), or
   include the pre-download modal from the start?
3. Home for the core: `pkg/services/library` (near the resolver it depends on) vs.
   `pkg/utils` (kept dependency-free). Leaning toward `library`, since it needs the
   resolver and DB graph.
