# YAVAM Roadmap

> **Living overview.** The detailed per-phase vision (specs, schema, UI) lives in
> [roadmap/YAVAM-2.0-vision.md](roadmap/YAVAM-2.0-vision.md). This file is the
> current, reprioritized plan and status — update it as things ship.
>
> Last updated: 2026-07-01

## Status snapshot

**Last released version: 1.3.19.** 1.4.0 is **in development** (Unstable channel
only) — nothing below is shipped to Stable users yet.

| Phase (vision) | Theme | Status |
| --- | --- | --- |
| 1 | Immediate fixes | ✅ Released (1.3.19) |
| 2 | SQLite foundation + card rework | 🚧 **In progress (1.4.0-dev)** — incomplete, see below |
| — | **Update channels (Stable/Unstable)** | 🚧 In progress (1.4.0-dev) — *not originally in the roadmap* |
| 3 | Advanced library management | ⏳ Not started |
| 4 | Smart search + sidebar redesign | ⏳ Not started — **priority raised (see below)** |
| 5 | Favorites / ratings / license filter | ⏳ Not started |
| 6 | Pocket system + action modal | ⏳ Not started |
| 7 | Hub integration + cleanup view | ⏳ Not started |
| 8–10 | i18n, themes, modular/split/graph | ⏳ Not started |

### Landed on `main` this session (unreleased, part of 1.4.0-dev)
- SQLite core: `pkg/database` with schema + append-only migrations; libraries
  mirrored from `config.json`; packages indexed on scan. **(incomplete — see P0)**
- **Update channels** — Stable/Unstable selector, channel-aware updater with full
  SemVer (incl. pre-release) comparison. See [RELEASING.md](RELEASING.md).
- Project docs: [BRANCHING.md](BRANCHING.md), [RELEASING.md](RELEASING.md),
  [WORKFLOWS.md](WORKFLOWS.md), [CLAUDE.md](../CLAUDE.md),
  [.github/CONTRIBUTING.md](../.github/CONTRIBUTING.md); Conventional Branch adopted.

## 🔴 P0 — Finish Phase 2 before anything else (regression)

The SQLite migration is **not complete**, and it currently regresses core behavior.
This blocks everything above it in the value chain (search, cleanup, pocket all
depend on reliable package + dependency data). Diagnosis from this session:

1. **The `dependencies` table is never written.** `LinkPass`
   ([pkg/services/library/analysis.go](../pkg/services/library/analysis.go))
   computes dependency/orphan/duplicate analysis **in memory** and emits it via the
   `package:analyzed` event — but there is **no `INSERT INTO dependencies`** anywhere.
   The empty table is "not implemented yet," not corruption.
2. **Frontend looks empty/missing** because the analysis isn't persisted or served
   consistently from the DB — the read path is half-migrated.
3. **Library path casing is inconsistent** (some lowercase, some not). SQLite text
   matching on `libraries.path` / `packages.rel_path` is **case-sensitive**, so
   inconsistent casing breaks the library↔package association and makes rows appear
   to vanish. Dependency *key* matching already lowercases both sides (fine); the
   **path** normalization is the culprit.

**The Phase 2 completion work (its own branch + conversation):**
- Canonicalize paths once (single normalization helper) on write *and* lookup.
- Persist the dependency graph to `dependencies` (dependent_id, dependency_id,
  is_resolved) during `LinkPass` — the reverse-dependency map already exists in
  memory, so both directions ("needs" and "used by") become fast, indexed queries.
- Serve package + analysis state from the DB reliably; reconcile the scan → DB →
  frontend flow.

## My perspective (what you asked)

**Versioning is artificial.** Mapping phases 1→10 onto `1.4.0, 1.4.5, 1.5.0 … 2.0.0`
pre-commits version numbers to work that hasn't happened. Recommendation: **decouple
versions from phases.** A version is just what ships — minor bump for a feature set,
patch for fixes. Keep phases as a *priority-ordered backlog*, and let `2.0.0` mean
"the vision is substantially delivered," not "phase 10."

**Priority order is off — here's the reorder I'd make:**
1. **Finish Phase 2 (P0 above).** Non-negotiable; the foundation is currently broken.
2. **Phase 4 — Smart search (raised, per your call).** Once package + dependency data
   is reliable, search is the highest user-value feature and it sits directly on that
   foundation. Bring it *ahead* of Phase 3 (library management) and Phase 5
   (ratings/favorites). Suggest splitting it: **4a smart searchbar** (tokens, filters)
   first — high value, self-contained — then **4b sidebar redesign / creator view**.
3. Phase 5 (ratings/favorites/license) — small, rides on the same DB, good quick wins.
4. Phase 3 (library management) — valuable but heavier and security-sensitive.
5. Phases 6–10 as before.

Rationale: search and ratings are *thin* layers on a solid data model and deliver
visible value fast; library-management and pocket are *thick* and can wait until the
foundation is proven. Do the boring foundational fix first, then the fun search work
lands on something trustworthy — "more accurate, faster, reliable than before," which
is exactly the goal.
