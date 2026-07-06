# SQLite foundation + card rework

> **Status:** 🔨 Building · **Horizon:** Now · **Targets:** 2.0 · Foundational.
> [Roadmap index](../ROADMAP.md) · **Spec:** [design/database-schema.md](../design/database-schema.md).

Move the index from ad-hoc scans to a persistent SQLite cache — the data layer
everything else (search, ratings, cleanup, pockets) builds on. The card rework
rides along because cards must eventually show rating/favourite state, which needs
the DB; doing both at once avoids a second card refactor.

## Delivers

- `pkg/database` service: schema init, append-only migrations, libraries mirrored
  from `config.json`, every scanned package indexed.
- In-place re-scan that preserves user flags and prunes vanished files.
- `license_type` captured during scan.
- Export/Import zip includes `yavam.db`.
- One `<PackageCard>` with `grid` / `list` / `dependency` layouts, replacing the
  divergent implementations.
- `PocketContext` wired into the provider tree, ready for [pockets](pockets.md).

## Card cleanliness rule

Cards show only thumbnail, name, creator, status tint, size, and type badge.
Ratings, favourites, and license badges live in the details panel, never on a card.

## Regression (P0)

The initial migration broke dependency data (empty "used by") and the read path.
Fixes — a family-anchored dependency graph and canonical path handling — are
tracked as the P0 item on the [roadmap index](../ROADMAP.md).
