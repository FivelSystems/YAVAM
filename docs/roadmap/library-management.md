# Advanced library management

> **Status:** 🗄️ Backlog · **Horizon:** Later · **Targets:** 2.0 · **Risk:** security-sensitive · **Depends on:** [SQLite foundation](sqlite-foundation.md).
> [Roadmap index](../ROADMAP.md).

Full control over configured libraries from the UI, plus a per-library permission
model so a host can expose some libraries to web clients and lock down others.

## Delivers

- Settings → Libraries panel to add, edit, delete, and rename libraries.
- Per-library properties: label, path, password, public toggle, and
  view/write/download/bulk-download permissions.
- Per-library bundle limits: max packages per bundle (default 50), whether deps
  count toward it (default on), whether it is enforced (default on).
- bcrypt-hashed passwords. Desktop is always master (never prompted); web clients
  are prompted when switching to a protected library.

## Security stance

Requires a security review before merge. **Every permission is enforced
backend-side on every relevant endpoint** — `allow_view` on
scan/thumbnail/contents, `allow_write` on toggle/delete/upload/install,
`allow_download` on single-file routes, `allow_bulk_dl` on bundle routes. Frontend
checks (greying out controls) are UX only, never the enforcement layer.
