# Refactoring Roadmap: Journey to v1.3.0

This roadmap is designed to guide the evolution of YAVAM from a prototype to a production-ready application. It prioritizes **Security** first (to stop the bleeding), then **Architecture** (to enable growth), and finally **Features** (Auth).

##  phase 1: The Safety Net (Security Hardening)
**Goal:** Eliminate Critical CVEs. Ensure the app cannot destroy the user's computer. (Matches **Issue #1: Security & Privacy**)

- [ ] **Step 1.1: Ban `cmd /C`**
    -   **Action:** Rewrite `pkg/manager` file operations (Delete, Open) to use `golang.org/x/sys/windows`.
    -   **Validation:** Use `gosec` to confirm no `G204` errors remain.
- [ ] **Step 1.2: Lockdown `pkg/server`**
    -   **Action:** Change `http.ListenAndServe` to listen ONLY on `127.0.0.1`.
    -   **Action:** Implement a strict `PathValidator` struct that is tested with unit tests to reject `..` and invalid roots.
- [ ] **Step 1.3: Add Tests**
    -   **Action:** Create `pkg/manager/manager_test.go`. Write tests for `ScanAndAnalyze`.
    -   **Note:** You cannot refactor safely without tests.

## Phase 2: Decoupling the Backend (Issue #5)
**Goal:** Break the "God Object" (`Manager`). Address **Issue #5: Internal Refactor** (Isolation levels, Context Management).

- [ ] **Step 2.1: Extract `FileSystem` Interface**
    -   Create `pkg/fs/filesystem.go`. Move all `os.*` calls here.
    -   Allows mocking disk operations for safer testing.
- [ ] **Step 2.2: Split Manager**
    -   Create `pkg/library/library_service.go` (Manages the list of paths).
    -   Create `pkg/scanner/scanner_service.go` (The heavy lifting).
    -   Keep `Manager` only as a coordinator that wires these services together.
- [ ] **Step 2.3: Context Management (Issue #5)**
    -   Implement "Command Pattern" for file operations to support Undo (CTRL+Z) and prevent conflicts between multiple clients.

## Phase 3: Taming the Frontend Monolith (Issue #5)
**Goal:** Reduce `App.tsx` from 2500 lines to <300 lines. Refactor for code reutilization.

- [ ] **Step 3.1: Install State Management**
    -   Add `zustand`. Create `useLibraryStore`.
    -   Move `packages`, `filters`, and `pagination` state into the store.
- [ ] **Step 3.2: Extract Major Views**
    -   Create `src/views/MainLibrary.tsx`.
    -   Create `src/views/Settings.tsx`.
    -   `App.tsx` should only contain the Layout (Sidebar + Content Area).
- [ ] **Step 3.3: Component Cleanup**
    -   Analyze `src/components`. Standardize props.

## Phase 4: Authentication & Advanced Features (Issue #13 & #2)
**Goal:** Prepare for Password Auth and Enhanced Library Management.

- [ ] **Step 4.1: Session Management (Issue #13)**
    -   Implement JWT or simple Session Token logic in `pkg/auth`.
- [ ] **Step 4.2: Login Screen**
    -   Create a new Route in React `/login`.
- [ ] **Step 4.3: Secure Endpoints**
    -   Add Middleware to `pkg/server` that checks for the Session Token.
- [ ] **Step 4.4: Device Approval (Issue #13)**
    -   Implement Whitelist logic for new device connections using a desktop popup.
- [ ] **Step 4.5: Enhanced Library Management (Issue #2)**
    -   Implement granular permissions (Read-Only, Password Locked, Web Visibility) for each library.
    -   Refactor Library struct to support `Alias`, `IsLocked`, `IsPrivate`.


---

## Technical Debt to Repay
| Debt | Interest Rate | Plan |
| :--- | :--- | :--- |
| `App.tsx` Monolith | **High** (Slows down every UI change) | Phase 3 |
| No Tests | **Critical** (Bugs reach users instantly) | Phase 1 & 2 |
| `cmd` usage | **Fatal** (Security vulnerability) | Phase 1 |
