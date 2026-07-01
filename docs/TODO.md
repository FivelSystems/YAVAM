# TODO / Annotations

> **Development to-do notes and known issues** found while working on YAVAM,
> tracked here so nothing gets lost. Add an entry as soon as an issue is spotted,
> even if it can't be fixed right away.

## Known issues / to investigate

- [ ] **Clipboard copy spawns a PowerShell window flash.** `CopyFilesToClipboard`
  shells out to PowerShell (`exec.Command("powershell", …, "Set-Clipboard …")`) in
  [pkg/services/system/system.go:63](../pkg/services/system/system.go#L63), so
  copying a file / pressing `CTRL+C` briefly pops a console window. This violates
  the project's "no raw console commands" rule. Replace with a native Windows
  clipboard API (set `CF_HDROP` via a syscall or a pure-Go clipboard lib) so no
  process spawns.

- [ ] **Sub-Dependencies not behaving as expected.**
  Packages like Ye666.Arriety only have the following dependencies: 
  * prestigitis.clothing-201010.latest
  * MacGruber.PostMagic.3
  * Vs1.vs1_H098_Demi.1
  * Vs1.vs1_H094_Laurel.1
  It is expected that sub-dependencies should resolve from the following content:
  "Ye666.Arrietty.latest" : { 
         "licenseType" : "PC", 
         "dependencies" : { 
            "MacGruber.PostMagic.3" : { 
               "licenseType" : "CC BY-SA", 
               "dependencies" : { 
               }
            }, 
            "prestigitis.clothing-201010.latest" : { 
               "missing" : "true", 
               "licenseType" : "MISSING", 
               "dependencies" : { 
               }
            }, 
            "vs1.vs1_H098_Demi.latest" : { 
               "licenseType" : "CC BY", 
               "dependencies" : { 
                  "vs1.vs1_H094_Laurel.latest" : { 
                     "licenseType" : "CC BY", 
                     "dependencies" : { 
                     }
                  }
               }
            }
         }
  However another package shows an extremely long list of sub-dependencies that are not present in the actual meta.json content file. This needs to be analyzed, fixed and tested.

- [ ] **Dependencies panel: expandable sub-tree (future).** The panel now lists a
  package's DIRECT declared dependencies in a stable order (only statuses/labels
  change across libraries). The transitive sub-dependency tree was intentionally
  dropped because it was library-relative and reshuffled the list. Bring it back as
  an *expandable* nested tree: each direct dependency can expand to reveal its own
  sub-dependencies on demand, keeping the top-level list stable. Ties into the
  "Sub-Dependencies not behaving as expected" item above — validate transitive
  resolution (and the "extremely long list" bug) while implementing it.

- [ ] **Update/validate library optimization** (merging, obsolete cleanup,
  individual picking, etc). Verify it still works against the new SQLite foundation
  (family-based dependencies, cross-library resolution, cache-first grid).
  *Eval:* the pocket system (2.0 roadmap, Phase 6) will reshape bulk actions later
  — do **not** rebuild it for pockets now; just confirm the existing flow is correct
  on the new backend and fix any regressions.

- [ ] **Update/validate corrupt-file elimination.** Confirm detection + removal
  still works with the SQLite index (corrupt packages are flagged during scan and
  persisted), and that removed files drop out of the index and the grid.

- [ ] **Update/validate package install modal.** Add a toggle *"Include dependencies
  from external libraries"* (**ON** by default) so installing a package can also pull
  its dependencies from other libraries. Verify the modal works on the new SQLite
  foundation. *Eval:* the pocket system will change this later — validate + add the
  toggle now; defer the pocket rework.

- [ ] **Update/validate package delete modal.** Add a toggle *"Include dependencies
  from external libraries"* (**OFF** by default) so deleting a package can optionally
  also remove its dependencies, but never external ones unless explicitly opted in.
  Verify the modal works on the new SQLite foundation. *Eval:* same as above —
  validate + add the toggle now; defer the pocket rework.

---

### 1.3.11 Patch (Fixed):
* [x] Run in background toggle doesn't work (System tray toggle)
* [x] Fast navigation between packages causes 'contents' tab (from details panel) to show images from a previously selected package instead of the current one, probably due to a race condition (i.e. contents appear when they finish loading but there's a chance that the user has already selected another package before contents finished loading?)