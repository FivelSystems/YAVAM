<!-- IMPORTANT NOTE - READ BEFORE WRITING
    This file follows the [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format. 
    Please ensure all future entries adhere to this standard.
    Always add entries to the top of the file, and use wails.json as the source of truth for current version numbers.
-->

# Changelog

## [1.3.2] - 2026-01-15

### Fixed
- **Critical**: Updater failed to restart application due to `.old` file renaming (App now detects and switches to new binary).

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

### Changed
- **Privacy**: 'V' hotkey now directly toggles "Blur Thumbnails" setting instead of a temporary view state.
- **Privacy**: "Hide Metadata" and "Hide Creator Names" settings are now conditional on "Blur Thumbnails" being active.
- **Security**: Restricted "Export/Import Settings" features to Desktop clients only (hidden on Web).
- **Parsing**: `parser.go` now explicitly prioritizes Scene thumbnails over Preset thumbnails to fix nondeterministic results.
- **Parsing**: Added `20MB` limit to thumbnail extraction to prevent Zip Bomb attacks.

### Fixed
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
- **Z-Index**: Fixed confirmation modals appearing behind the settings menu (upcoming fix).
- **Linting**: Resolved unused variable warnings in Settings and Dashboard components.
- **Open App Data**: Fixed the button logic to explicitly enter the directory instead of just selecting it in the parent folder.
- **Merge**: Fixed duplicates not being moved to library root on Web Clients.
- **Upload**: Fixed file list persisting in Upload Modal when reopened.
- **Restore**: Fixed application crash when restoring backup settings.
- **Scanning**: Fixed a race condition where packages from a previous library scan could infiltrate the current view.

### Security
- **Hardening**: Added Ed25519 Digital Signatures (SHA256) to Auto-Updater.
- **DoS Protection**: Patched a potential Zip Bomb vulnerability in the package parser by enforcing strict read limits (Memory Safety).
- **Authentication**: Passwords are never transmitted over the network (Challenge-Response).
- **Protection**: Added sliding-window rate limiting (5 attempts/min) to login endpoints.
- **Critical**: Removed dependencies on `powershell.exe` and `cmd.exe` to prevent Command Injection.
- **Critical**: Strict `PathValidator` and binding internal server to `127.0.0.1` to prevent Local Network exploits.
- **Hardening**: Added Ed25519 Digital Signatures (SHA256) to Auto-Updater.

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

