### Features
- [x] Redesign settings modal to improve categorization. (Implemented Tab Interface) [Fixed v1.3.0]
- [x] Dedicated 'privacy' tab settings where censor/blur can be toggled on and off, and a slider to set the amount of blur. [Fixed v1.3.0]
- [x] Additional toggles for enabling/disabling package name and package thumbnail when privacy mode is on. [Fixed v1.3.0]
- (Queued for v1.4.0) Enhanced library management window with advanced settings and configs (See issue [#2](https://github.com/FivelSystems/YAVAM/issues/2))

### ⌨️ Planned Keybinds (v1.3.1)
- [ ] **Selection**
    - `CTRL + A`: Select all items in current view.
    - `ESC`: Clear selection.
- **Navigation & UI**
    - `TAB`: Toggle Left Sidebar visibility.
    - `CTRL + ,`: Open Settings.
    - `CTRL + F`: Focus Search Bar.
    - `F5` / `CTRL + R`: Refresh Library / Rescan.
- **Actions**
    - `DEL`: Delete selected package (with confirmation).
    - `Space`: Quick Preview / Open Details Panel for selected.
    - `CTRL + U`: Open Upload Modal.
- **View Control**
    - `CTRL + +` / `CTRL + =`: Increase Thumbnail Size.
    - `CTRL + -`: Decrease Thumbnail Size.
    - `CTRL + 0`: Reset Thumbnail Size.
### Bugs
- [x] The same client can trigger multiple login requests, causing the same device to appear multiple times in the active devices list [Fixed v1.3.0]
- [x] Login screen is appearing twice, one timme for the full page, and a second time when the dashboard loads. [Fixed v1.3.0]
- [x] We need to get rid of the login page, and continue with the standard modal format. [Fixed v1.3.0]
- [x] The server's flag for 'Public access' does not guarantee to allow anyone view library contents, it should only prevent from locking the entire application behind a login screen. [Clarified: Read-Only + Download access]
- Switching between libraries should trigger authentication modal, based on the chosen library's configuration, requires enhaced llibrary management update first because we need advanced settings and configs.

### Refactoring
- [x] Remove VamPath (Main Library) concept from backend [Fixed v1.3.0]

