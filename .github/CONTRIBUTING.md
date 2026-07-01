# Contributing to YAVAM

Thanks for helping improve YAVAM! This guide covers how we branch, commit, and
release. For architecture and conventions, see [CLAUDE.md](../CLAUDE.md) and
[AGENTS.md](../AGENTS.md).

## Getting set up

Prerequisites and build steps live in the [README](../README.md#-for-the-devs)
("For the Devs"). In short:

```bash
wails dev            # run with hot reload
wails build          # produce build/bin/YAVAM.exe
go test ./...        # backend tests
cd frontend && npx tsc --noEmit && npm test   # frontend checks
```

## Branching

We follow [Conventional Branch](https://conventionalbranch.org/): lowercase,
`type/kebab-description`.

| Prefix | Use |
| --- | --- |
| `feature/` | New functionality |
| `bugfix/` | Bug fix |
| `hotfix/` | Urgent fix against a release |
| `chore/` | Tooling, CI, deps |
| `docs/` | Documentation only |
| `release/vX.Y.Z` | A stable release checkpoint (publishes a release) |

Branch off `main`, and open a Pull Request back into `main`. `dev` is retired.
Full model: [docs/BRANCHING.md](../docs/BRANCHING.md).

## Commits

We follow [Conventional Commits](https://www.conventionalcommits.org/):
`type(scope): description` (e.g. `feat(ui): add channel selector`).
Types: `feat`, `fix`, `refactor`, `test`, `chore`, `docs`.
Scopes: `backend`, `frontend`, `ui`, `security`, `docs`.

## Changelog

Update `CHANGELOG.md` following [Keep a Changelog](https://keepachangelog.com/):
add entries under `## [Unreleased]`, grouped by `Added`, `Changed`, `Fixed`, etc.
They become the release notes automatically.

## Releases

Releases ship through **Stable** and **Unstable** channels. See
[docs/RELEASING.md](../docs/RELEASING.md) for versioning and how to cut a release,
and [docs/WORKFLOWS.md](../docs/WORKFLOWS.md) for how the CI is wired.

## Before you open a PR

- `go build ./...`, `go test ./...`, and `npx tsc --noEmit` pass.
- Validate filesystem paths with `IsPathAllowed`; never shell out for file ops.
- Reuse existing UI components; no native `alert`/`confirm`.
- Never commit secrets, tokens, or hardcoded personal paths.
