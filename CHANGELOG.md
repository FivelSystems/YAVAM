<!-- IMPORTANT NOTE - READ BEFORE WRITING
    This file follows the [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format. 
    Please ensure all future entries adhere to this standard.
    Always add entries to the top of the file, and use wails.json as the source of truth for current version numbers.
-->

# Changelog

## [1.3.0] - Unreleased

### Architecture & Cleanup
- **Backend Decoupling**: Extracted `LibraryService`, `SystemService`, and `ConfigService` from the monolithic Manager.
- **Standalone Compliance**: Removed all hardcoded references to "AddonPackages" logic to support arbitrary library folders.
- **Ghost Library Fix**: Fixed an issue where clearing the library list would cause the application to scan its own installation directory.
- **Refactor**: Updated `pkg/manager` to use `pkg/fs` for all filesystem interactions.
- **Testing**: Added comprehensive unit tests for `LibraryService` covering installation, toggling and collision detection.

### Feature: Authentication (Secure)
- **Challenge-Response**: Implemented industry-standard "Challenge-Response" authentication. Passwords are never transmitted over the network.
- **Dynamic Credentials**: Passwords are now manageable via the Settings UI (Desktop-only) and persisted securely.
- **Session Management**: Added "Active Devices" list to Settings, allowing revocation of specific sessions.
- **Brute Force Protection**: Added sliding-window rate limiting (5 attempts/min) to login endpoints.
- **Middleware**: Added strict `AuthMiddleware` to internal server, protecting all sensitive routes (`upload`, `delete` etc).
- **Security Audit**: Addressed and resolved "Unprotected Local Server" vulnerabilities.

### Security
- **Defense in Depth:** Added `DeviceName` tracking and Browser/OS identification for better auditability.
- **Critical:** Removed all dependencies on `powershell.exe` and `cmd.exe` for file operations to prevent Command Injection.
- **Critical:** Implemented strict `PathValidator` and bound internal server to `127.0.0.1` to prevent Local Network exploits.
- **Architecture:** Decoupled `Manager` from OS syscalls via new `FileSystem` interface (Dependency Injection).
- **Frontend Refactor:** Reorganized source code into a Feature-based Architecture (`features/`, `components/`) for better maintainability.

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
