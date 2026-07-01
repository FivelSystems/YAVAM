# Branching Model

YAVAM follows the [**Conventional Branch**](https://conventionalbranch.org/) specification.
Branch names are lowercase, use a `type/` prefix, and separate words with hyphens.

## Branch types

| Prefix | Purpose | Example |
| --- | --- | --- |
| `main` | The integration line. Everything lands here. Also feeds the **Unstable** channel. | `main` |
| `feature/` | New functionality. | `feature/hub-integration` |
| `bugfix/` | A fix for a bug. | `bugfix/changelog-modal` |
| `hotfix/` | An urgent fix against a released version. | `hotfix/scan-crash` |
| `release/` | A stable release checkpoint. Creating one **publishes a Stable release**. | `release/v1.4.0` |
| `chore/` | Tooling, CI, deps, housekeeping. | `chore/github-workflows` |
| `docs/` | Documentation only. | `docs/release-process` |

## How work flows

```
feature/ | bugfix/ | chore/ | docs/  ──►  main  ──►  release/vX.Y.Z
                                            │
                                            └──►  weekly Unstable prerelease
```

1. Branch off `main` using the right prefix.
2. Open a Pull Request back into `main`. Keep commits in
   [Conventional Commits](https://www.conventionalcommits.org/) style
   (`type(scope): description`).
3. Once merged, `main` holds the latest integrated work. It automatically feeds
   the **Unstable** channel (see [RELEASING.md](RELEASING.md)).
4. When a set of changes is ready to ship to everyone, cut a
   `release/vX.Y.Z` branch from `main`. That is the single, deliberate action
   that produces a **Stable** release.

## Roles of the long-lived refs

- **`main`** — always buildable; the source of Unstable builds. Merging here
  never ships anything to Stable users on its own.
- **`release/vX.Y.Z`** — one immutable branch per released version. It doubles as
  a checkpoint and as the Stable release trigger. To ship a fix, cut the next
  patch branch (`release/vX.Y.(Z+1)`); do not re-purpose an existing one.

## Notes

- **`dev` is retired.** Its old job (staging before release) is now split between
  `main` (integration + Unstable) and `release/*` (Stable). Do not create new work
  on `dev`.
- Old `release/*` branches from before this model (e.g. `release/v1.3.20`) are
  historical and should be left alone.
