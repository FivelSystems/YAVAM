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

---

### 1.3.11 Patch (Fixed):
* [x] Run in background toggle doesn't work (System tray toggle)
* [x] Fast navigation between packages causes 'contents' tab (from details panel) to show images from a previously selected package instead of the current one, probably due to a race condition (i.e. contents appear when they finish loading but there's a chance that the user has already selected another package before contents finished loading?)