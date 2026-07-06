# VaM Hub integration + Discover + Cleanup view

> **Status:** 🗄️ Backlog · **Horizon:** Later · **Targets:** 2.0 · **Depends on:** [pockets](pockets.md).
> [Roadmap index](../ROADMAP.md) · **Spec (cleanup feeder):** [design/pocket-system.md](../design/pocket-system.md).

Connect YAVAM to the VaM Hub to resolve missing dependencies, discover content, and
reclaim disk space — all reviewed through the same pocket modal.

## Delivers

- **Missing → Hub lookup.** Missing dependency IDs are batched against the Hub and
  cached; each shows as "Available on Hub" (download), "External link" (opens
  Patreon/MEGA in the browser), or "Not on Hub".
- **Discover mode.** Browse the Hub inside YAVAM's filter UI, same card layout as
  local packages, with an Installed / Outdated / Not installed badge.
- **External sources.** VaM Hub and direct HTTPS URLs supported; WebDAV/Nextcloud
  feasible; Google Drive, MEGA, and torrents out of scope.
- **Library Cleanup view.** Finds duplicates, obsoletes, corrupt files, and
  freely-available-online content, then loads a proposed plan into the pocket for
  review — never executes directly.

## "Clear Available Online" safety line

Paid content is never at risk: `PC` / `PC EA` packages are never included in a
cleanup deletion, and anything not freely downloadable is offered as "Open in
Browser" only. Enforced backend-side regardless of frontend state. Rules in the
[spec](../design/pocket-system.md).
