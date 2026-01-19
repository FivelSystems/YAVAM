# Architecture Retrospective: Context Refactor (v1.3.3)

**Status:** Implemented & Verified
**Date:** 2026-01-17
**Authors:** FivelSystems & Antigravity (Architect Agent)

## 1. Executive Summary (The "What")
In version 1.3.3, we performed a major architectural refactor to dismantle the "God Component" anti-pattern found in `Dashboard.tsx`.
-   **Before:** A single ~3100 line file managing Server, Library, Packages, Selection, Filters, and Keybinds.
-   **After:** A ~250 line layout shell acting as a Controller. All state is distributed into **7 Domain-Driven Contexts**.

## 2. The Problem (The "Why")
1.  **Prop Drilling:** To allow a button in `Sidebar.tsx` to delete a package, we had to pass functions through 4 layers (`Dashboard` -> `SidebarContainer` -> `Sidebar` -> `SidebarItem`).
2.  **Tight Coupling:** Changing how `packages` were scanned required editing `Dashboard.tsx`, risking bugs in unrelated features like "Selection" or "Keybinds".
3.  **Testability:** It was impossible to test "Filtering" logic in isolation because it was hardcoded inside the main component.

## 3. Design Patterns Applied (The "How")

### A. Context Composition Pattern
**Where:** `src/context/AppProviders.tsx`
**Why:** To manage "Provider Hell" (deep nesting) and enforce Dependency Order.
**Implementation:** We created a `combineProviders` utility that logically nests providers but visually flattens them into a clean array.
```typescript
export const AppProviders = combineProviders(
    AuthProvider,
    ToastProvider,     // Foundation
    ServerProvider,    // Config
    PackageProvider,   // Data
    ActionProvider     // Logic
);
```

### B. Dependency Injection (DI)
**Where:** `ActionContext.tsx`
**Why:** To ensure actions have access to the correct state without passing arguments manually.
**Implementation:**
-   `ActionProvider` consumes `usePackageContext` (for data) and `useSelectionContext` (for targets).
-   This allows `usePackageActions()` to be called anywhere without arguments: `const { deleteSelected } = usePackageActions()`. The context "injects" the dependencies automatically.

### C. Facade-Hook Pattern
**Where:** `src/hooks/usePrivacySettings.ts`, `src/hooks/useLayoutSettings.ts`
**Why:** To hide the complexity of "persistence" and "keybinds" from the View layer.
**Implementation:**
The `Dashboard` component doesn't know *how* `censorThumbnails` is saved. It just calls the hook.
-   **Hidden Complexity:** The hook internally handles `localStorage.getItem/setItem` OR default values.
-   **Hidden Events:** The hook subscribes to the `toggle_privacy` keybind ('V') internally.

### D. Separation of Concerns (SoC)
**Where:** `FilterToolbar.tsx` vs `useFilters.ts` vs `FilterContext.tsx`
**Why:** To separate Logic (State) from Presentation (UI).
-   **State:** `FilterContext` holds the data (search query, tags).
-   **Logic:** `useFilters` contains the sorting algorithms and filtering `Array.filter` chains.
-   **View:** `FilterToolbar` simply renders inputs and binds them to the context setters.

## 4. Architectural Hierarchy

The strict order of providers ensures stability (no "UseContext undefined" errors).

| Level | Providers | Responsibility |
| :--- | :--- | :--- |
| **0. Root** | `AppProviders` | Wrapper component |
| **1. Foundation** | `ToastProvider`, `KeybindProvider` | Must be active first so other layers can emit errors or listen to keys. |
| **2. Infrastructure** | `ServerProvider`, `LibraryProvider` | Manages connection to Go backend and filesystem paths. |
| **3. Data** | `PackageContext` | Fetches raw data based on Level 2 (Active Library). |
| **4. Domain** | `FilterContext`, `SelectionContext` | Refines raw data (Level 3) for the user. |
| **5. Operations** | `ActionContext` | Executes commands. Depends on **ALL** layers above. |

## 5. File Manifest (What Moved Where)

**State Containers (Contexts):**
-   `src/context/ServerContext.tsx`
-   `src/context/LibraryContext.tsx`
-   `src/context/PackageContext.tsx`
-   `src/context/FilterContext.tsx`
-   `src/context/SelectionContext.tsx`
-   `src/context/ActionContext.tsx`

**Logic Units (Hooks):**
-   `src/hooks/usePackages.ts` (Scanning logic)
-   `src/hooks/usePackageActions.ts` (CRUD logic)
-   `src/hooks/usePrivacySettings.ts` (Persistence logic)
-   `src/hooks/useDragDrop.ts` (Upload logic)

**UI Components:**
-   `src/features/layout/FilterToolbar.tsx`
-   `src/features/layout/PackageLayout.tsx`
-   `src/features/layout/SidebarContainer.tsx`

## 6. Data Persistence Strategy (Dual-Layer)

Per `AGENTS.md`, we strictly separate "System Configuration" from "User Preferences".

| Layer | Storage | Responsibility | Managed By |
| :--- | :--- | :--- | :--- |
| **Host Config** | `config.json` (Backend) | Global system settings (Ports, Library Paths, Auth Rules). Shared across all users/browsers. | `ServerContext` (via `useServer` hook -> Wails) |
| **Client Prefs** | `localStorage` (Frontend) | View settings (Grid Size, Dark Mode, Sort Order). Unique to each device/browser. | `usePrivacySettings` / `useLayoutSettings` |

**Note:** `SystemModals.tsx` acts as the bridge, accepting props from both layers.
- It takes `serverPort`, `publicAccess` (Host Config) from `ServerContext`.
- It takes `gridSize`, `censorThumbnails` (Client Prefs) from `Dashboard` state hooks.

## 7. Verification
-   **Build:** Validated with `npm run build` (Exit Code 0).
-   **Typing:** Full TypeScript coverage for all Context interfaces.
-   **Persistence:** Verified `localStorage` restoration for Layout and Privacy settings.
