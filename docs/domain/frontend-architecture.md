# Domain Knowledge: Frontend Architecture

> **Context:** This document defines the architectural patterns for the YAVAM Frontend (React + Vite). All agents modifying `frontend/` MUST adhere to these rules.

## 1. Core Pattern: Domain-Driven Context Composition

YAVAM avoids the "God Component" anti-pattern by distributing state across specific domains. We do **NOT** use global state managers like Redux. instead, we use a strict hierarchy of React Contexts.

### The Rule of "AppProviders"
All Context Providers are initialized in `src/context/AppProviders.tsx`.
*   **Do NOT** nest providers manually in `Dashboard.tsx`.
*   **ALWAYS** use the `combineProviders` utility to maintain a clean, flat list.

### Rationale: Why Not Redux / Zustand?
YAVAM is a "Thin Client Management Console".
1.  **Server State vs. Client State:**
    *   **Files (v1.0):** The File System is the source of truth.
    *   **Hub (v1.8):** The REST API will be the source of truth.
    *   **Concept:** In modern React, we treat these as "Server State" (synced via Hooks/Query) rather than "Global Client State" (Store). We avoid duplicating the Backend's truth into a Redux store to prevent synchronization bugs.
2.  **Action Complexity vs. State Complexity:**
    *   YAVAM has complex **Actions** (Move, Optimize, Install), handled by `ActionContext` (Command Pattern).
    *   YAVAM has simple **State** (Lists of files).
    *   Redux excels at complex *State interactions* (e.g., game physics), but adds boilerplate for *Actions*. Our `ActionContext` is a more direct command layer for a Management Console.

## 2. The Dependency Hierarchy (Strict Order)

You must understand the dependency chain to avoid `undefined` context errors.

| Level | Providers | Role | Dependencies |
| :--- | :--- | :--- | :--- |
| **1. Foundation** | `ToastProvider`<br>`KeybindProvider` | **Infrastructure**<br>Allows emitting UI alerts and listening to keys. | *None* |
| **2. Config** | `ServerProvider` | **Backend Bridge**<br>Manages `config.json` (Ports, Paths) via Wails. | Level 1 (Toasts) |
| **3. Data** | `LibraryProvider`<br>`PackageProvider` | **Raw Data**<br>Manages active library path and scanning results. | Level 2 (Server Config) |
| **4. Domain** | `FilterContext`<br>`SelectionContext` | **Refinement**<br>Filters raw data and handles user selection. | Level 3 (Packages) |
| **5. Operations** | `ActionContext` | **Command Layer**<br>Executes logic (Delete, Install) using data from above. | **ALL** Levels Above |

### ⚠️ Coding Rules
1.  **Never** import `ActionContext` inside `ServerContext` (Circular Dependency).
2.  **Always** place new Providers in `AppProviders.tsx` according to this hierarchy.

## 3. State Management Strategy (Dual-Layer Persistence)

We separate "System Configuration" from "User Preferences".

### A. Host Configuration (`config.json`)
*   **What:** Settings that affect the system logic (Server Port, Library Paths, Auth Rules).
*   **Storage:** Backend JSON file.
*   **Access:** `ServerContext` -> `useServer()` -> Wails Backend.
*   **Scope:** Shared across all users/browsers on this machine.

### B. Client Preferences (`localStorage`)
*   **What:** Settings that affect the *view* logic (Grid Size, Sort Order, Privacy Blur).
*   **Storage:** Browser `localStorage`.
*   **Access:** Specialized Hooks (`usePrivacySettings`, `useLayoutSettings`).
*   **Scope:** Unique to the specific browser/client.

> **Why separate hooks? (Separation of Concerns)**
> We split `usePrivacySettings` (Logic: Hiding content) from `useLayoutSettings` (Logic: Sizing/Positioning) so components can subscribe ONLY to the data they need.

### Scalability: How to add more settings?
We follow the **Domain Grouping** pattern. Do not add everything to one file.
*   **New Theme Settings?** Create `useThemeSettings.ts` (Primary Color, Font Size).
*   **New Network Settings?** Create `useNetworkSettings.ts` (Timeout, Retry Count).
*   **Need to see EVERYTHING?** (e.g., for a "Reset All" button) -> Create a `useAllSettings()` hook that simply calls `usePrivacySettings()`, `useLayoutSettings()`, etc., and returns them together. This gives you flexibility without coupling.

## 4. Hybrid Architecture (Desktop vs Web)

> **⚠️ CRITICAL:** YAVAM is both a Desktop App and a Web Server.

| Context | User Role | Technical Environment |
| :--- | :--- | :--- |
| **Desktop** | **Host / Owner** | Runs via Wails (`window.go`). Has full OS access. No Auth required (localhost). |
| **Web Client** | **Remote Guest** | Runs via Browser (`http://IP:PORT`). No OS access. **REQUIRES Authentication**. |

### Rules for Agents:
1.  **Always Check Environment:** Use `if (window.go) { ... } else { ... }` (or helper utils).
2.  **Web Needs APIs:** Desktop calls Go directly. Web **MUST** fetch from `/api/*` endpoints.
3.  **Auth First:** Web requests typically require an `Authorization` header (JWT). Ensure data fetching hooks handle 401/403 errors by redirecting to Login.

## 5. Component Architecture

### The "Layout Shell" Pattern
Top-level components (like `Dashboard.tsx`) should contain **NO LOGIC**. Their only job is:
1.  Initialize Hooks (e.g., `usePrivacySettings`).
2.  Compose Layout (pass state to `Sidebar`, `Content`, `Modals`).

**Example:**
```tsx
// ✅ GOOD: Dashboard.tsx
export const Dashboard = () => {
   const { viewMode } = useLayoutSettings();
   return <PackageLayout viewMode={viewMode} />;
}
```

```tsx
// ❌ BAD: Dashboard.tsx
export const Dashboard = () => {
   const [viewMode, setViewMode] = useState('grid'); // Logic mixed with layout
   useEffect(() => { ... }, []); // Side effects in layout
   return <PackageLayout viewMode={viewMode} />;
}
```

## 5. Directory Structure
*   `src/context/`: Context Definitions & `AppProviders.tsx`.
*   `src/hooks/`: Logic extraction (State + Effects).
*   `src/features/`: UI Components grouped by domain (e.g., `library/`, `system/`).
*   `src/components/`: Generic, reusable UI atoms (Buttons, Modals).

## 6. Centralized Logic Patterns
### Package Status Authority
Package status (Valid, Corrupt, Duplicate, Root) is complex and derived from multiple properties (`isCorrupt`, `missingDeps`, `isOrphan`).
**Rule:** NEVER implement ad-hoc `if/else` checks for package status in your components (e.g., `PackageCard`, `Sidebar`).
**Solution:** Always use the centralized helper: `src/features/library/utils.ts` -> `getPackageStatus(pkg)`.
This ensures that "Duplicate", "Obsolete", and "Root" statuses are visualized consistently across the entire application (Grid, List, Dependants).

**Supported Statuses:**
- `VALID`: Healthy package.
- `ROOT` (Unreferenced): Healthy package that is an entry point (no incoming deps).
- `MISMATCH`: Missing dependencies.
- `DUPLICATE`: Exact copy of another package (Priority: High).
- `OBSOLETE`: Older version of a package (Priority: High).
- `CORRUPT`: Broken ZIP file (Priority: Critical).
- `DISABLED`: Valid but disabled by user.
