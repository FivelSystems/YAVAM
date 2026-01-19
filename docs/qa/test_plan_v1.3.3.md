# Test Plan: v1.3.3 Frontend Refactor

> **Objective:** Verify functionality of the "Thin Client" refactor, ensuring no regression in Desktop mode and full functional parity in Web Client mode.

## 1. Environment Setup
*   **Desktop:** Windows 10/11, local Wails runtime.
*   **Web Client:** Chrome/Firefox, accessing `http://localhost:SERVER_PORT`.

## 2. Core Test Cases

### TC-01: Launch & Initialization (Hybrid)
| Step | Action | Expected Result | Pass/Fail |
| :--- | :--- | :--- | :--- |
| 1 | Launch App (Desktop) | App loads. Library list populated from `config.json`. Last active library selected. | [ ] |
| 2 | Open Web Client | Login prompts (if auth enabled). Library list loaded via `/api/config`. | [ ] |
| 3 | Check Settings | "Server Port" and "Public Access" reflect backend state. | [ ] |

### TC-02: Library Management
| Step | Action | Expected Result | Pass/Fail |
| :--- | :--- | :--- | :--- |
| 1 | Switch Library | Grid clears. New packages load. Active library updates in Sidebar. | [ ] |
| 2 | Add Library | System dialog opens (Desktop). Path added to list. | [ ] |
| 3 | Remove Library | Library removed from list. App selects next available or "No Library". | [ ] |

### TC-03: Package Scanning (Non-Blocking UX)
| Step | Action | Expected Result | Pass/Fail |
| :--- | :--- | :--- | :--- |
| 1 | Trigger Scan (Refresh Icon) | **NO Modal** blocks screen. Top-right scanner bar shows progress. | [ ] |
| 2 | Navigation during Scan | Can change tabs, select packages, or switch settings while scanning. | [ ] |
| 3 | Completion | Spinner stops. Package count updates. Toast "Scan Complete". | [ ] |

### TC-04: Grid Interaction & Context Menu
| Step | Action | Expected Result | Pass/Fail |
| :--- | :--- | :--- | :--- |
| 1 | Single Click | Item selected (Blue border). Right sidebar opens (Details). | [ ] |
| 2 | Ctrl + Click | Multiple items selected. Sidebar shows "Multi-select" or Summary. | [ ] |
| 3 | **Right Click** | **Context Menu appears** at cursor. | [ ] |
| 4 | Menu Action: "Open Folder" | (Desktop) Opens Windows Explorer. (Web) Hidden or Disabled. | [ ] |
| 5 | Menu Action: "Toggle" | Package enables/disables. Visual indicator updates. | [ ] |

### TC-05: Web Client Specifics
| Step | Action | Expected Result | Pass/Fail |
| :--- | :--- | :--- | :--- |
| 1 | Check Thumbnails | Images load via `/api/thumbnail?...`. | [ ] |
| 2 | Context Menu: Download | "Download File" option appears (Web only). Triggers browser download. | [ ] |
| 3 | Toggle Package | Sends `POST /api/toggle`. Updates UI on success. | [ ] |

## 3. Regression Checks (Refactor Areas)
*   [ ] **Drag & Drop:** Drop a `.var` file onto the window. Upload modal should appear.
*   [ ] **Keybinds:** `Ctrl+A` selects all. `Del` triggers delete confirmation.
*   [ ] **Filtering:** Type in search bar. Grid filters immediately.
*   [ ] **Sorting:** Change sort to "Size (Largest)". Large files appear first.

## 4. Known Issues / Watchlist
*   *None currently active.*
