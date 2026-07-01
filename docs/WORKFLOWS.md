# GitHub Workflows

Two workflows live in [`.github/workflows/`](../.github/workflows/). Together they
implement the Stable and Unstable channels described in [RELEASING.md](RELEASING.md).

## `release.yml` — Stable Release

**Trigger:** a push to any `release/v*` branch (also runnable manually with an
explicit version input).

**What it does:**

1. **Resolve & guard** (a quick Linux job):
   - Derives the version from the branch name (`release/v1.4.0` → `1.4.0`).
   - Checks whether the tag `v1.4.0` already exists. If it does, the run stops —
     this is what makes re-pushing a release branch a safe no-op.
   - Validates that `wails.json` matches the branch version, failing early with a
     clear message on a mismatch.
2. **Build & publish** (only when the guard passed):
   - Builds the Windows application.
   - Extracts the matching `## [X.Y.Z]` section from `CHANGELOG.md` for the notes.
   - Creates the `vX.Y.Z` tag and publishes a normal GitHub Release.

Because it publishes a normal (non-prerelease) release, it becomes the "latest"
release that the app's Stable channel reads.

## `unstable.yml` — Weekly Unstable Build

**Trigger:** a weekly schedule (Saturday, chosen because the project's commit
history is quietest then — the most settled point in the week) plus a manual
"Run workflow" button.

**What it does:**

1. **Decide & resolve** (a quick Linux job):
   - Scheduled runs are skipped when `main` has had no new commits in the last
     week (manual runs always proceed).
   - Computes a pre-release version: `X.Y.Z-unstable.<date>.<shortsha>`, where
     `X.Y.Z` is `wails.json`'s current `productVersion`.
2. **Build & publish:**
   - Builds the Windows application from `main`.
   - Uses the `## [Unreleased]` changelog section for notes, falling back to the
     commit list since the last tag.
   - Publishes a GitHub **pre-release** (hidden from the "latest release"
     endpoint, so Stable users never see it).
3. **Prune:** deletes the oldest Unstable pre-releases, keeping only the most
   recent ones so the releases list stays clean.

## How the app consumes these

The in-app updater checks a different endpoint per channel:

- **Stable** → the repository's "latest release" (normal releases only).
- **Unstable** → the full releases list, choosing the newest build by SemVer
  (pre-releases included), so Unstable is always at least as new as Stable.

Version comparison follows full SemVer precedence, including pre-release
identifiers, so successive Unstable builds order correctly and any final release
outranks its own pre-releases.

## Local testing

`scripts/test_update_server.go` is a mock server that mimics both endpoints. Run
it, point the app at it with the `YAVAM_UPDATE_URL` environment variable (the API
base URL), and switch channels in Settings to exercise the update flow without
touching GitHub. See the script's startup output for the exact commands.
