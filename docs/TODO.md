# TODO / Annotations

> **This file is where we leave to-do notes and known issues** found during
> development, so nothing is lost between sessions. Add an entry the moment you
> spot something, even if you can't fix it right away.

## Known issues / to investigate

- [ ] **Clipboard copy spawns a PowerShell window flash.** `CopyFilesToClipboard`
  shells out to PowerShell (`exec.Command("powershell", …, "Set-Clipboard …")`) in
  [pkg/services/system/system.go:63](../pkg/services/system/system.go#L63), so
  copying a file / pressing `CTRL+C` briefly pops a console window. This violates
  our "no raw console commands" rule. Replace with a native Windows clipboard API
  (set `CF_HDROP` via a syscall or a pure-Go clipboard lib) so no process spawns.

---

### 1.3.11 Patch (Fixed):
* [x] Run in background toggle doesn't work (System tray toggle)
* [x] Fast navigation between packages causes 'contents' tab (from details panel) to show images from a previously selected package instead of the current one, probably due to a race condition (i.e. contents appear when they finish loading but there's a chance that the user has already selected another package before contents finished loading?)