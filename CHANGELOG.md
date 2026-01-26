<!-- IMPORTANT NOTE - READ BEFORE WRITING
    This file follows the [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format. 
    Please ensure all future entries adhere to this standard.
    Always add entries to the top of the file, and use wails.json as the source of truth for current version numbers.
-->

# Changelog

## [1.3.12] - 2026-01-26

### Fixed
-   **CRITICAL:** Fixed "What's New" modal not appearing after updates. The application now correctly persists the `LastSeenVersion` to `config.json` instead of volatile local storage, ensuring the changelog is shown exactly once per version update.
-   **CRITICAL:** Fixed Infinite Login Loop caused by recursive `logout` triggers.
-   **CRITICAL:** Fixed Login Race Condition using explicit token passing.
-   **CRITICAL:** Fixed "Ghost Fix" log spam in public access checks.
-   **CRITICAL:** Fixed "Contents" tab failing to load on Web Clients due to missing Authorization header (`401 Unauthorized`).

-   **Robustness:** Implemented In-Memory Token Caching to eliminate I/O race conditions for all API calls immediately after login.
-   **System Tray**: Fixed "Run in Background" toggle not persisting or affecting the application's close behavior. It now correctly synchronizes user preference with the backend.
-   **Thumbnails**: Refactored thumbnail detection to use the "Sibling File" rule (Suggested by gicstin/VPM), ensuring robust detection across all folder structures (#25).
    -   Implemented **Category-Weighted Sibling Rule** (Scenes > Looks > Clothing > Assets).
    -   Added **Alphabetical Tie-Breaker**: When priorities are equal, the first file alphabetically wins (Visual Consistency).
    -   Added **Texture Filter**: Explicitly ignores images in `/textures/` or `/assets/` unless they have a direct content sibling.
- **Library UX**: Fixed a race condition in the "Right Sidebar" where rapidly selecting packages would display the contents of a previously clicked package (stale data). The sidebar now reliably shows the currently selected package's content.
- **Web Client**: Updated fallback version display to v1.3.11.
- **Performance**: Optimized `CardGrid` and `PackageCard` to reduce memory usage by 50% and eliminate UI stutter.
    - Removed expensive "Layout" animations (Framer Motion) that caused reflows on every filter change.
    - Optimized `State Duplication` in thumbnail handling to reduce Garbage Collection pressure.
    - Page transitions are now faster and consume less RAM (No double-buffering of pages).
    - **Suspend Mode**: Implemented intelligent resource management. When minimizing to the System Tray, the application unmounts the UI layer, releasing ~500MB+ of RAM/VRAM while keeping the backend active. Restoring the window instantly recovers the state.

## [1.3.10] - 2026-01-20

### Added
- **Sidebar**: Added a search/filter button to the "Creators" section header. It expands into an input field to quickly find specific creators and collapses when focus is lost.
- **UX**: Added "Random Package" keybind (Default: `R`). Selects a random package from the current filtered view and opens the Details Panel. (Does not auto-scroll for performance).
- **UX**: Added Friendly Error Banner for library access failures (e.g. "Access Denied" or missing folders).
- **UX**: Added visual indentation and hierarchy indicators to the Dependency List in the Right Sidebar to clearly distinguish direct vs. nested dependencies.
- **UX**: Decoupled "Locate Package" from strict file path matching. It now intelligently falls back to Package ID (`Creator.Name.Version`) lookup, enabling seamless navigation to the same package across different libraries.
- **Dependency Management**: Implemented **Recursive Installer**. The Install Modal now intelligently resolves and lists all missing dependencies, allowing one-click installation of complex packages.
- **Dependency Management**: Added **Cascade Delete** support. When deleting a package, the system now analyzes and offers to purge orphaned dependencies that are no longer used by any other package.
- **Dependency Management**: Added **Reverse Dependency Lookup** ("Used By"). You can now inspect a package to see exactly which Scenes or Presets depend on it.
- **Dependency Management**: Implemented **Fuzzy Package Lookup**. The system can now locate packages even if the version number varies slightly (e.g. mapping `v1` to `v1.0`), significantly improving "Missing" status accuracy.

### Changed
- **Status Colors**: Changed "Root" package status color from Blue (System) to Indigo to clarify distinction from system files.
- **Status Priority**: Prioritized status checks to ensure disabled packages are explicitly marked `DISABLED` (Gray) rather than `OBSOLETE` (Yellow) or `DUPLICATE` (Purple).
- **Duplicate Logic**: Distinguish "Older Version" (Yellow/Obsolete) from "Redundant Copy" (Purple/Duplicate) to reduce false positives.

### Fixed
#### UX & Interface
- **Library Navigation**: "View Library" button in Install Modal now correctly triggers a library switch and re-scan.
- **Navigation**: Fixed "Locate Package" requiring double-clicks when switching pages. It now correctly auto-scrolls to the target immediately after the page transition.
- **Filters**: Clicking the active "Creator" filter pill in the Details Panel now toggles the filter off (Reset).
- **Selection**: Fixed `CTRL+A` (Select All) not visually highlighting "Corrupt" packages.
- **Animation**: Fixed "Locate Package" animation to restart reliably on rapid clicks (spam-proofing) and handle interruptions correctly.
- **UX**: Improved Install Feedback. Upload and Install modals now show a summary screen (Installed/Skipped/Failed) instead of closing immediately.
- **UX**: Upload Modal now automatically refreshes the library view upon successful completion.
- **UX**: Suppressed intrusive "Located Package" status (Success/Info) toasts when clicking dependencies. Toasts now only appear if the target package cannot be found (Error).
- **UX**: Implemented a "Title Glow" animation in the Right Sidebar when the selected package is off-screen.

#### Core Logic & Status
- **Web Client**: Fixed "Unauthorized" error when engaging in package actions (Toggle/Delete) by ensuring the authorization token is correctly attached to API requests.
- **Web Client**: Fixed "Storage Unavailable" error in Upload Modal by protecting disk space & collision checks with authentication.
- **Web Client**: Fixed missing file size display in Upload Modal for empty or special files.
- **Desktop Client**: Fixed "0 B" file size display in Upload Queue by implementing a backend bridge to retrieve file metadata for dragged files.
- **Security**: Hardened Desktop file system bindings to enforce strict path validation, matching Web Client security rules.
- **Web Client**: Fixed "Infinite Scanning" spinner on mobile/web clients by ensuring the server broadcasts the `scan:complete` event upon finish.
- **Dependencies**: Fixed "Incomplete" dependency list in the Details Panel by unifying recursive logic with the Install Modal.
- **Dependencies**: Fixed "False Missing" status by automatically masking internal warnings (Mismatch/Root) as Valid (Green) if the package exists.
- **Dependencies**: Fixed discrepancy where valid dependencies appeared as "Missing" due to dot-notation or implicit `.latest` references.
- **Duplicate Logic**: Resolved duplicate detection on Windows by enforcing strict lower-case path normalization.
- **Selection**: Fixed "Grid Selection Mismatch" / Jitter. Enforced deterministic sorting (tie-breaking by filePath) to prevent packages from changing positions during re-renders, ensuring clicks always land on the correct item.
- **Keybinds**: Fixed `DELETE` keybind. It now correctly triggers the delete action (with multi-selection support) instead of being blocked by the details panel logic.

## [1.3.2] - 2026-01-15

### Added
- **Library**: Added "Corrupt" package detection. Invalid/Corrupt `.var` files are now flagged with a red overlay and excluded from standard status counts.
- **Library**: Added "Corrupt" filter to Sidebar.
- **Library**: Added "Include Dependencies" toggle to Install Modal. Recursively resolves and installs required packages (supports loose & exact version matching).
- **Refactor**: Standardized Sidebar context menu logic for better consistency and maintainability.
- **Docs**: Added PlantUML architecture diagrams (`docs/diagrams/`) for system overview, auth flow, and scan logic.

### Fixed
- **UI**: Dashboard now auto-scrolls to top when switching pages (#20).
- **Web**: Fixed file downloads having `.zip` appended to the filename on some browsers (#7).

## [1.3.1] - 2026-01-15

### Added
- **Stability**: Implemented Global Error Boundary to catch crashes and offer "Factory Reset" recovery.
- **Maintenance**: Added comprehensive "Factory Reset" logic (Bootstrapped Restart + Full AppData Wipe).
- **Keybinds**: Implemented Centralized Keybind System.
    - Added `CTRL+F` (Search), `TAB` (Sidebar), `CTRL+,` (Settings), `CTRL+A` (Select All).
    - Added `KeybindsTab` in Settings (Read-Only list of shortcuts).
    - Added `Shift+Left/Right` to switch pages instantly.
- **Testing**: Added Frontend Unit Testing infrastructure (`vitest` + `react-testing-library`).
- **Dev**: Added `npm test` script.
- **Testing**: Added unit tests for dependency analysis (`packageDependencyAnalysis.test.ts`) to ensure accurate version resolution.

### Changed
- **Privacy**: 'V' hotkey now directly toggles "Blur Thumbnails" setting instead of a temporary view state.
- **Privacy**: "Hide Metadata" and "Hide Creator Names" settings are now conditional on "Blur Thumbnails" being active.
- **Security**: Restricted "Export/Import Settings" features to Desktop clients only (hidden on Web).
- **Parsing**: `parser.go` now explicitly prioritizes Scene thumbnails over Preset thumbnails to fix nondeterministic results.
- **Parsing**: Added `20MB` limit to thumbnail extraction to prevent Zip Bomb attacks.

### Fixed
- **Critical**: Updater failed to restart application due to `.old` file renaming (App now detects and switches to new binary).
- **Crash**: Fixed "Recursive Zip" crash when exporting backups to the YAVAM folder.
- **Crash**: Fixed "Rendered fewer hooks" crash in Dashboard initialization.
- **Factory Reset**: Fixed "Resurrection Bug" where local storage would restore libraries after a wipe.
- **Factory Reset**: Fixed file locking issues preventing clean data wipe (implemented detached process restart).
- **Keybinds**: 'V' (Privacy Mode) no longer toggles configuration settings, only the temporary view state.
- **Persistence**: Fixed `gridSize` and `authPollInterval` resetting on restart due to missing `localStorage` sync.
- **Persistence**: Fixed React Strict Mode double-mount causing settings to revert to defaults.
- **Types**: Fixed TypeScript errors in `Dashboard.tsx` and `setup.ts`.

## [1.3.0] - 2026-01-14

### Added
- **User Interface**: Redesigned settings into a unified, tabbed dialog (Application, Privacy, Network, Security).
- **Setup Wizard**: Enhanced 3-step setup (Library, Password, Network) with "Run on Startup" option.
- **Privacy Controls**: Added "Hide Metadata" (Invisible text) and "Hide Creator Names" for privacy, plus Blur Intensity slider.
- **Backup & Restore**: Added comprehensive system to Export/Import application settings (zipped `AppData`) with Zip Slip protection.
- **What's New**: Added a "What's New" modal that automatically displays this changelog after an update (persistent version tracking).
- **Session Management**: Added "Active Devices" list to Settings, allowing revocation of specific sessions.
- **Authentication**: Implemented industry-standard "Challenge-Response" authentication.
- **Configuration**: Added "Auth Polling Interval" setting (Network Tab), allowing custom revocation check frequency (5s-60s).
- **Web Security**: Restricted access to sensitive settings (Network, Security, Keybinds) for web clients ("Guest" mode).
- **Testing**: Added comprehensive unit tests for `LibraryService`, `pkg/manager`, and Zip utilities.
- **Session Persistence**: Active sessions are now persisted to disk (`auth_config.json`) and restored on restart, preventing logout loops.
- **Keybinds**: Restored the "Keybinds" tab and functionality, allowing users to rebind the "Toggle Privacy" shortcut.

### Changed
- **Domain Logic**: Refined Thumbnail Extraction to prioritize **Scene** images over Presets to reduce ambiguity.
- **Domain Logic**: Expanded `.vap` detection to correctly identify content in `StartingAssets` (Clothing, Hair) folders.
- **Breaking Change**: Removed `VamPath` (Main Library) concept from backend. Server now treats all libraries equally.
- **Breaking Change**: API endpoints (`/api/packages`, `/api/scan/collisions`, etc.) now **strictly require** a `path` parameter.
- **Architecture**: Decoupled `Manager` into `LibraryService`, `SystemService`, and `ConfigService`.
- **Compliance**: Removed all hardcoded references to "AddonPackages" logic to support arbitrary library folders.
- **Refactor**: Updated `pkg/manager` to use `pkg/fs` for all filesystem interactions.
- **Refactor**: Reorganized frontend source into a Feature-based Architecture.
- **Refactor**: Migrated `LastSeenVersion` from `localStorage` to `config.json` for reliable persistence across backups.
- **UI Consistency**: Standardized Button components and moved Backup controls to the Security Tab. Fixed "Blur Strength" slider layout.
- **Branding**: Renamed Go module and internal references from `varmanager` to `yavam`.
- **Animations**: Implemented "Cascading" entrance animations for settings tabs for a smoother / premium feel.
- **Dependencies**: Updated `AnimatePresence` logic to support collapsible tabs on mobile.

### Fixed
- **Setup Crash**: Fixed "Path not found" error during initial setup (missing directory creation).
- **Settings Layout**: Fixed modal size jumping and stability issues.
- **Duplicates**: Fixed duplicate file uploads on drag-and-drop.
- **Ghost Library**: Fixed an issue where clearing the library list would cause scanning of the installation directory.
- **Access Denied**: Resolved access errors by implementing strict, thread-safe path validation in the server.
- **Login Redirect**: Fixed issue where successful login via modal would not redirect to the dashboard.
- **Modal Layout**: Fixed modal title crowding by moving titles to top-left and increasing spacing from the close button.
- **Factory Reset**: Fixed "Reset Database" confirmation not appearing (implemented generic confirmation handler).
- **Z-Index**: Fixed confirmation modals appearing behind the settings menu.
- **Linting**: Resolved unused variable warnings in Settings and Dashboard components.
- **Open App Data**: Fixed the button logic to explicitly enter the directory instead of just selecting it in the parent folder.
- **Merge**: Fixed duplicates not being moved to library root on Web Clients.
- **Upload**: Fixed file list persisting in Upload Modal when reopened.
- **Restore**: Fixed application crash when restoring backup settings.
- **Start-up**: Fixed "What's New" modal not appearing after an update by implementing reliable version tracking in local storage.
- **Self-Update**: Fixed critical race condition where the application would fail to restart after an update (Old process blocking new process).
- **Scanning**: Fixed a race condition where packages from a previous library scan could infiltrate the current view.


### Security
- **Hardening**: Added Ed25519 Digital Signatures (SHA256) to Auto-Updater.
- **Process Safety**: Reverted unsafe `cmd /c` process spawning on Windows, replacing it with `SysProcAttr` for secure and reliable process detachment.
- **DoS Protection**: Patched a potential Zip Bomb vulnerability in the package parser by enforcing strict read limits (Memory Safety).
- **Authentication**: Passwords are never transmitted over the network (Challenge-Response).
- **Protection**: Added sliding-window rate limiting (5 attempts/min) to login endpoints.
- **Critical**: Removed dependencies on `powershell.exe` and `cmd.exe` to prevent Command Injection.
- **Critical**: Strict `PathValidator` and binding internal server to `127.0.0.1` to prevent Local Network exploits.

## [v1.2.17] - 2026-01-12

### Added
- **Sequential Web Uploads**: Refactored web client uploads to process files one-by-one, preventing timeouts and providing real-time progress.
- **Collision Detection**: Added instant visual feedback for duplicate files in the upload modal (yellow highlighting).
- **Web Client Crash Protection**: Added null checks for package scanning to prevent "property of null" errors.
- **Disk Space Check**: Uploads now verify available disk space before starting.
- **Creator Filter**: Clicking the creator name in the details panel now filters the dashboard by that creator. Click again to reset.

### Fixed
- **Library Persistence**: Web clients now remember the last selected library after a page reload.
- **Web Install Progress**: Fixed the progress bar not updating during web client installs (restored SSE listener).
- **Pagination Reset**: Refreshing the library view no longer resets the page number to 1.
- **File Drop Error**: Fixed a crash on Desktop when dropping a file onto itself.
- **"Failed to Fetch"**: Suppressed spurious error toast when cancelling scans during library switching.
- **Access Denied**: Resolved "Access denied" errors for content loading by implementing strict, thread-safe path validation in the server.
- **Login Redirect**: Fixed an issue where successful login via the modal would not redirect to the dashboard.
- **De-authorization**: Fixed missing notification/logout when a session is revoked by the admin.

### Security
- **Strict Path Validation**: Refactored all file access endpoints to use a centralized `IsPathAllowed` check, preventing unauthorized access even with valid tokens if the path is outside allowed libraries.

