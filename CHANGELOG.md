# Changelog

<!-- IMPORTANT NOTE - READ BEFORE WRITING
    This file follows the [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format. 
    Please ensure all future entries adhere to this standard.
-->

## [v1.2.17] - 2026-01-12

### Added
- **Sequential Web Uploads**: Refactored web client uploads to process files one-by-one, preventing timeouts and providing real-time progress.
- **Collision Detection**: Added instant visual feedback for duplicate files in the upload modal (yellow highlighting).
- **Web Client Crash Protection**: Added null checks for package scanning to prevent "property of null" errors.
- **Disk Space Check**: Uploads now verify available disk space before starting.
- **Creator Filter**: Clicking the creator name in the details panel now filters the dashboard by that creator. Click again to reset.

### Security
- **Critical:** Removed all dependencies on `powershell.exe` and `cmd.exe` for file operations to prevent Command Injection.
- **Critical:** Implemented strict `PathValidator` and bound internal server to `127.0.0.1` to prevent Local Network exploits.
- **Architecture:** Decoupled `Manager` from OS syscalls via new `FileSystem` interface (Dependency Injection).

### Internal
- Refactored `pkg/manager` to use `pkg/fs` for all filesystem interactions.
- Added comprehensive unit and integration tests for file operations.ide library folders.
- **Localhost Binding**: Internal server now binds strictly to 127.0.0.1 by default to prevent unauthorized network access.

### Fixed
- **Library Persistence**: Web clients now remember the last selected library after a page reload.
- **Web Install Progress**: Fixed the progress bar not updating during web client installs (restored SSE listener).
- **Pagination Reset**: Refreshing the library view no longer resets the page number to 1.
- **File Drop Error**: Fixed a crash on Desktop when dropping a file onto itself.
- **"Failed to Fetch"**: Suppressed spurious error toast when cancelling scans during library switching.
