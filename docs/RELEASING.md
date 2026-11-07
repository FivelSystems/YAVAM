# Releasing

YAVAM ships through two **channels**. Users choose one in
`Settings → Application → Updates`; the default is **Stable**.

| Channel | Who it's for | Published as | Cadence |
| --- | --- | --- | --- |
| **Stable** | Everyone. Tested releases. | A normal GitHub Release | When you cut a `release/vX.Y.Z` branch |
| **Unstable** | Volunteers who want the bleeding edge. | A GitHub **pre-release** | Weekly, from `main` |

The channels never cross unless a user opts in: GitHub's "latest release" only
ever points at a normal release, so the app's Stable channel is structurally
unable to see an Unstable pre-release.

## Versioning

We use [Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH`.

- **`wails.json` → `info.productVersion` is the source of truth** for the app's
  own version.
- **Bump it to the _next target_ at the start of a development cycle.** Right
  after shipping `1.3.19`, set it to `1.4.0`. If you forget, Unstable builds get
  tagged `1.3.19-unstable.*`, which SemVer reads as *older* than `1.3.19`.
- Unstable builds are tagged automatically as
  `vX.Y.Z-unstable.<date>.<shortsha>` (a SemVer pre-release, so it always sorts
  *below* the matching final release).

## Release notes come from `CHANGELOG.md`

We follow [Keep a Changelog](https://keepachangelog.com/).

- Keep an **`## [Unreleased]`** section at the top while developing. The Unstable
  build reads this section for its notes (and falls back to the raw commit list
  if it's missing).
- **A Stable release reads the `## [X.Y.Z]` section** whose version matches the
  release. It must exist before you cut the branch, or the notes fall back to a
  generic message.

So the convention at release time is: **rename `## [Unreleased]` to
`## [X.Y.Z] - YYYY-MM-DD`** and start a fresh empty `## [Unreleased]` above it.

## Cutting a Stable release

Everything is already merged into `main`. Then:

1. **Finalize the version.** Confirm `wails.json`'s `productVersion` is the
   version you're releasing (e.g. `1.4.0`).
2. **Finalize the changelog.** Ensure a `## [1.4.0] - <date>` section exists.
3. **Cut the release branch** from `main`:
   ```bash
   git checkout main && git pull
   git checkout -b release/v1.4.0
   git push -u origin release/v1.4.0
   ```
   Pushing the branch triggers the Stable workflow, which builds, tags `v1.4.0`,
   and publishes the release with notes from the changelog.

**Idempotency:** the git tag is the lock. If you push more commits to
`release/v1.4.0`, the workflow sees that `v1.4.0` already exists and does
nothing — a version publishes exactly once. To ship a fix, bump to `1.4.1` and
cut `release/v1.4.1`.

## ⚠️ Cutting a patch release *behind* `main`'s current target

The steps above assume you're releasing exactly what `main` currently is. That
is **not** true once a feature branch (e.g. the next minor's work) has merged
into `main` — from that point on, `main` *is* the next version's code, and
**branching a patch release from `main`'s tip would ship that entire
in-progress feature set under a lower, patch-looking version number** (this
happened in practice: a `1.3.x` hotfix was accidentally cut from `main` after
it already contained all of a `1.4.0` feature branch's work, and had to be
deleted and redone).

If `wails.json`'s `productVersion` on `main` is already ahead of the patch line
you need to fix (e.g. `main` says `1.4.0` but you need to ship `1.3.24`):

1. **Never branch from `main`'s tip.** Branch from the last tag in that patch
   line instead: `git checkout -b release/v1.3.24 v1.3.23`.
2. **Cherry-pick only the specific fix commit(s)** onto that branch — not a
   merge, not a rebase onto `main`. Find them by their hash on `main` (or on
   whatever branch they were authored on) and `git cherry-pick <hash>`.
3. Before pushing, sanity-check the diff is actually small:
   `git diff --stat vX.Y.(Z-1) HEAD` — it should list only the files the fix
   touched. If it lists dozens of unrelated files, you branched from the wrong
   place.
4. Bump `wails.json` and add the `## [X.Y.Z]` changelog section on *this*
   branch, same as any other release — then also commit that changelog
   section back to `main` per the rule above.

## Publishing an Unstable build

Usually automatic (weekly, from `main`). To publish one on demand, run the
**Weekly Unstable Build** workflow from the Actions tab ("Run workflow"). It only
skips when `main` has had no new commits recently. Old Unstable pre-releases are
pruned automatically so the releases list stays tidy.

## Downgrading (Unstable → Stable)

Switching a client back to Stable installs the latest Stable build even if it is
a *lower* version than the Unstable build the user is on. This is safe: updates
only replace the executable and never touch user data. Metadata added on newer
builds (e.g. ratings) simply isn't shown by the older build and reappears if the
user returns to Unstable.

## Quick checklist

- [ ] `wails.json` `productVersion` is correct
- [ ] `CHANGELOG.md` has a matching `## [X.Y.Z]` section
- [ ] Everything intended is merged to `main`
- [ ] `git checkout -b release/vX.Y.Z && git push -u origin release/vX.Y.Z`
- [ ] Verify the release appears with the expected notes and assets

See [BRANCHING.md](BRANCHING.md) for the branch model and
[WORKFLOWS.md](WORKFLOWS.md) for how the automation is wired.
