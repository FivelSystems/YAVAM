# CLAUDE.md

Guidance for Claude Code (and other AI agents) working in this repository.
See [AGENTS.md](AGENTS.md) for the full persona/rule set; this file is the
practical quick-start and the source of truth for conventions.

## Project

**YAVAM** (Yet Another VaM Addon Manager) — a portable desktop app that indexes,
analyzes, and manages Virt-A-Mate `.var` packages, with an optional local web
server for phone/tablet access. It never modifies game files.

**Stack:** [Wails v2](https://wails.io/) — Go backend + React 18 + TypeScript +
Vite + Tailwind CSS frontend. Local persistence via SQLite (`modernc.org/sqlite`,
pure-Go, no CGO for the DB).

## Commands

```bash
wails dev            # run the app with hot reload
wails build          # produce build/bin/YAVAM.exe

go build ./...       # compile the backend
go test ./...        # run all Go tests
go vet ./...         # static checks

cd frontend
npm run dev          # frontend-only dev server
npx tsc --noEmit     # typecheck
npm test             # Vitest + React Testing Library
```

Regenerate Wails bindings after adding/changing exported `App` methods:
`wails generate module`. Frontend code may also call methods at runtime via
`window.go.main.App.*` (the existing pattern), so a missing typed binding is not
fatal.

## Architecture

**Backend (`pkg/`, `app.go`, `main.go`)**
- `app.go` — the Wails `App` struct. Keep it a **thin wrapper**; real logic lives
  in services.
- `pkg/services/` — business logic (`config`, `auth`, `library`, …).
- `pkg/manager` — orchestrates config + DB + libraries.
- `pkg/server` — the optional local HTTP server (auth, SSE, upload, API).
- `pkg/database` — SQLite layer. Migrations are **append-only and forward-only**
  (`pkg/database/migration.go`); never edit an existing migration, only add one.
- `pkg/updater` — self-update + release-channel logic.

**Frontend (`frontend/src/`)**
- Functional components with TypeScript interfaces; Tailwind for all styling.
- Reuse existing UI primitives (`components/ui/`) and settings components before
  writing new ones.
- No native `alert`/`confirm`; use the Modal/Toast components.

### Data model (important)
- **`config.json` is the source of truth** for configured library paths and
  host-level settings.
- **SQLite is an index/cache** rebuilt from disk scans, plus a small amount of
  genuinely new data (ratings/favourites/notes in `user_metadata`). Library paths
  are mirrored *from* config.json into the DB on launch, so an older build that
  predates the DB still works off config.json.
- **Settings split:** host/system settings → `config.json` (backend). Per-device
  view preferences (grid size, sort) → `localStorage` (client).

## Release channels & updates

Two channels, chosen by the user in `Settings → Application → Updates`
(default Stable):
- **Stable** — normal releases; the updater reads the repo's "latest release".
- **Unstable** — weekly pre-releases off `main`; the updater reads the full
  releases list and picks the newest by SemVer.

`pkg/updater` compares versions with full **SemVer precedence including
pre-release identifiers**. The `YAVAM_UPDATE_URL` env var overrides the API base
(used by `scripts/test_update_server.go` for local testing).

## Branching & releases

We use [Conventional Branch](https://conventionalbranch.org/) and
[Conventional Commits](https://www.conventionalcommits.org/). Details:
- [docs/BRANCHING.md](docs/BRANCHING.md) — branch model (`main`, `release/vX.Y.Z`,
  `feature/`, `bugfix/`, `chore/`, `docs/`). `dev` is retired.
- [docs/RELEASING.md](docs/RELEASING.md) — how to cut a release, versioning, and
  the changelog convention.
- [docs/WORKFLOWS.md](docs/WORKFLOWS.md) — how the CI workflows are wired.

## Conventions & gotchas

- **`wails.json` `info.productVersion` is the version source of truth.** Bump it
  to the *next target* at the start of a dev cycle, or Unstable builds get an
  invalid pre-release order (see RELEASING.md).
- **CHANGELOG.md** follows [Keep a Changelog](https://keepachangelog.com/): keep
  `## [Unreleased]` during dev; rename it to `## [X.Y.Z] - date` at release.
  Release notes are extracted from these headings by CI.
- **Go:** standard-library-first; validate every filesystem path with
  `IsPathAllowed` before access; never shell out (`cmd`/`powershell`) for file
  operations; add/adjust `*_test.go` when touching logic.
- **Never commit secrets, tokens, or hardcoded personal paths.** Use dynamic
  paths (`os.UserHomeDir`, etc.).
- Run `go build ./...`, `go test ./...`, and `npx tsc --noEmit` before considering
  a change done.
