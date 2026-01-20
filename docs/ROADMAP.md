# Refactoring Roadmap: Journey to v1.4.0+

This roadmap guides the evolution of YAVAM.
**Current Status:** v1.3.4 (Stability & Logic Hardening).
**Next Major Milestone:** v1.4.0 (Robustness & diagnostics).

## ✅ Completed Phases (v1.0.0 - v1.3.3)

### Phase 1: The Safety Net (Security Hardening) - **DONE**
- [x] **Step 1.1: Ban `cmd /C`**: Replaced all shell calls with native Go syscalls.
- [x] **Step 1.2: Lockdown `pkg/server`**: `PathValidator` implemented, `127.0.0.1` binding enforced.
- [x] **Step 1.3: Add Tests**: Unit tests added for Manager and LibraryService.

### Phase 2: Decoupling the Backend (Issue #5) - **DONE**
- [x] **Step 2.1: Extract `FileSystem` Interface**: `pkg/fs` created.
- [x] **Step 2.2: Split Manager**: Decoupled into `LibraryService` and `SystemService`.
- [x] **Step 2.3: Context Management**: Thread-safe operations implemented.

### Phase 3: Taming the Frontend Monolith (Issue #5) - **DONE**
- [x] **Step 3.1: Install State Management**: Context API architecture implemented (`PackageContext`, `LibraryContext`, etc.).
- [x] **Step 3.2: Extract Major Views**: Feature-based folder structure (`features/library`, `features/settings`).
- [x] **Step 3.3: Component Cleanup**: `PackageCard` and `Sidebar` refactored.

### Phase 4: Authentication & Advanced Features - **DONE**
- [x] **Step 4.1: Session Management**: Challenge-Response implemented.
- [x] **Step 4.2: Login Screen**: Tabbed Settings & Auth Dialogs created.
- [x] **Step 4.3: Secure Endpoints**: Middleware enforcement active.

---

## 🚧 Phase 5: Refinement, Robustness & Logic (v1.3.10 - v1.4.0)
**Goal:** Perfect the logic (Dependency Graph, Orphans, Duplicates) and improve UX.

- [x] **Step 5.0: Logic Hardening (v1.3.10)**
    -   **Action:** Detect "Unreferenced" packages (Orphans). (Fixed: Indigo Status)
    -   **Action:** Fix "Used By" / Reverse Dependency graph logic. (Fixed: Robust Dependency Parsing)
    -   **Action:** Improve "Duplicate" detection to handle exact vs loose matches. (Fixed: Global Map & Status Priority)
- [ ] **Step 5.1: Corrupt Package Detection**
    -   **Action:** Enhance `pkg/scanner` to detect invalid header/EOF in zip files.
    -   **UI:** Display "Corrupt" badge. (Partially implemented in v1.3.2)
- [x] **Step 5.2: Privacy & UX (v1.3.10)**
    -   **Action:** Granular Privacy (Details Panel Censor).
    -   **Action:** "Neon Flash" Highlight for better visibility.
    -   **Action:** (v1.3.10) Fixed "Locate" animation spam/interruption issues.
    -   **Action:** (v1.3.10) Fixed "False Missing" dependencies via Status Masking.
    -   **Action:** (v1.3.10) **Critical**: Fixed Recursive Dependency display in Sidebar (Details Panel).
    -   **Action:** (v1.3.10) **UX**: Fixed Selection Logic (`CTRL+A`) for corrupt packages.
- [ ] **Step 5.3: Graph Logic Migration (v1.4.0)**
    -   **Action:** Move Dependency Graph calculation (`packageDependencyAnalysis.ts`) to Go Backend for performance/caching.
- [ ] **Step 5.4: Advanced Library Management**
    -   **Action:** Enhanced Configs & Settings per library.
    -   **Action:** Trigger Auth Modal when switching libraries (Security).

---

## 🔮 Phase 6: Advanced Viz & Bulk Ops (v1.5.0)
**Goal:** Deep insights (Visualization) and Mass Actions (Bulk Downloads).

### 1. Bulk Downloads (From README.md)
**Goal:** Grab tons of files as one big ZIP.
-   **Architecture:** Backend zip-streaming service.
-   **UI:** "Download All" context menu action for selections or filters.

### 2. Dependency Tree Visualization
**Concept:** A hierarchical "Tree View" for the "Roots" (formerly Unreferenced) filter.
-   **Goal:** Visualize how packages link together, starting from entry points (Scenes/Looks) down to their deepest dependencies.
-   **Structure:**
    > Scene A
    >   ├── Look B
    >   │     ├── Clothing C
    >   │     └── Hair D
    >   └── Asset Pack E
-   **Technical Challenge:** Handling cyclic dependencies and large graph performance.
-   **User Value:** Deep understanding of library composition + Bulk Download of entire trees.

---

## Technical Debt to Repay
| Debt | Interest Rate | Plan |
| :--- | :--- | :--- |
| `App.tsx` Monolith | **Paid Off** | Done (v1.3.3) |
| No Tests | **In Progress** | Ongoing |
| Frontend Performance | **Medium** (Graph calculation on main thread) | Step 5.3 |
