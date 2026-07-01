# CLAUDE.md

The single guidance file for AI agents (Claude Code, Copilot, Cursor, etc.)
working in this repository. It is both the practical quick-start and the source
of truth for conventions and rules.

## Project

**YAVAM** (Yet Another VaM Addon Manager) — a portable desktop app that indexes,
analyzes, and manages Virt-A-Mate `.var` packages, with an optional local web
server for phone/tablet access. It never modifies game files.

**Stack:** [Wails v2](https://wails.io/) — Go backend + React 18 + TypeScript +
Vite + Tailwind CSS frontend. Local persistence via SQLite (`modernc.org/sqlite`,
pure-Go, no CGO for the DB).

## Prime directives

- **Explicit consent to publish.** Never `git push` (or otherwise share code
  externally) without the user's approval of the current state.
- **Constructive pushback over compliance.** If a request is insecure,
  non-performant, or wrong, stop and explain why, then offer a better path. Don't
  ship "working but messy" code.
- **Security first.** This app runs a local web server and touches the user's
  filesystem. Never expose full filesystem access; validate every path.
- **Portable.** The app runs without installation — no registry keys, no fixed
  system paths. Use dynamic paths (`os.UserHomeDir`, etc.).
- **No broken windows.** If you pass a function missing error handling, fix it.

## Domain knowledge

Before designing features that touch VaM internals (parsing, dependencies, scene
structure) or the frontend architecture, read the relevant spec:
- [docs/domain/virt-a-mate.md](docs/domain/virt-a-mate.md)
- [docs/domain/frontend-architecture.md](docs/domain/frontend-architecture.md)

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
- `pkg/utils` — shared, dependency-free helpers (extract here when a rule repeats).

**Frontend (`frontend/src/`)**
- Functional components with TypeScript interfaces; Tailwind for all styling
  (no CSS-in-JS or `.css` files beyond `index.css`). Use CSS variables for colors
  to keep future theming possible. Mobile view is a first-class concern.
- State via React Context or hooks; avoid Redux unless truly needed.
- Reuse existing UI primitives (`components/ui/`) and settings components before
  writing new ones. If you write a pattern twice, extract a component.
- No native `alert`/`confirm`; use the Modal/Toast components.

### Data model (important)
- **`config.json` is the source of truth** for configured library paths and
  host-level settings.
- **SQLite is an index/cache** rebuilt from disk scans, plus a small amount of
  genuinely new data (ratings/favourites/notes in `user_metadata`). Library paths
  are mirrored *from* config.json into the DB on launch, so an older build that
  predates the DB still works off config.json.
- **Settings split:** host/system settings → `config.json` (backend). Per-device
  view preferences (grid size, sort) → `localStorage` (client). Rule of thumb: if
  a mobile user needs a different value than the desktop user, it's `localStorage`.

## Code quality & style

- **Self-documenting code.** Prefer readable code over comments. Comments explain
  *how a system/architecture works and why* — not what each line does. Delete
  comments that merely restate the code.
- **Apply design patterns deliberately.** For non-trivial work, evaluate where a
  pattern fits (and where it doesn't), and say so.
- **DRY & SOLID.** Extract repeated rules into one definition (`pkg/utils` or a
  shared component); keep single responsibility and inject dependencies.
- **Human-readable names.** No cryptic abbreviations, single-letter names with no
  meaning, or magic numbers — name the constant or the concept.

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
  `feature/`, `bugfix/`, `chore/`, `docs/`). `dev` is retired. `main` feeds the
  **Unstable** channel; cutting a `release/vX.Y.Z` branch publishes **Stable**.
- [docs/RELEASING.md](docs/RELEASING.md) — how to cut a release, versioning, and
  the changelog convention.
- [docs/WORKFLOWS.md](docs/WORKFLOWS.md) — how the CI workflows are wired.

Commit style is `type(scope): description` (`feat`, `fix`, `refactor`, `test`,
`chore`, `docs`; scopes like `backend`, `frontend`, `ui`, `security`, `docs`).

## Conventions & gotchas

- **`wails.json` `info.productVersion` is the version source of truth.** Bump it
  to the *next target* at the start of a dev cycle, or Unstable builds get an
  invalid pre-release order (see RELEASING.md).
- **CHANGELOG.md** follows [Keep a Changelog](https://keepachangelog.com/): keep
  `## [Unreleased]` during dev; rename it to `## [X.Y.Z] - date` at release.
  Release notes are extracted from these headings by CI. Group entries under
  `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`.
- **Go:** standard-library-first; validate every filesystem path against the
  configured libraries (`Manager.ValidatePath`) before access; never shell out
  (`cmd`/`powershell`) for file operations; add/adjust `*_test.go` when touching
  logic. Ensure thread-safety in `manager` and `server`.
- **Security review** when touching `auth`, `server`, `filesystem`, `config`, or
  `logging`: no secrets/tokens/personal paths committed; no PII or session tokens
  in logs; sanitize all frontend/HTTP inputs; keep `.gitignore` covering keys and
  build artifacts. Record findings in `docs/SECURITY_AUDIT.md`.
- Run `go build ./...`, `go test ./...`, `go vet ./...`, and `npx tsc --noEmit`
  before considering a change done.
