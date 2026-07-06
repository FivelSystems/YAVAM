# Favourites, ratings, license filter

> **Status:** 📋 Todo · **Horizon:** Next · **Targets:** 2.0 · **Depends on:** [SQLite foundation](sqlite-foundation.md).
> [Roadmap index](../ROADMAP.md).

A thin, high-visibility layer on the DB: mark favourites, rate packages, filter by
license, hide unwanted packages.

## Delivers

- Favourite toggle and 1–5 star rating, in the details panel (never on the card).
- License badge in the details panel, next to the creator name.
- Search, filter, and sort by favourite, rating, and license.
- Hide/unhide via an `is_hidden` flag — removes a package from the grid without
  touching the file. Managed through context menu, bulk selection, an `H` hotkey,
  and `status:hidden` / `status:visible` tokens.

## Rating identity

Ratings and favourites key to the `Creator.PackageName` **family**, so they are
version-agnostic: rating `AcidBubbles.Timeline` covers every version.
