# AI Agent Context & Rules (`AGENTS.md`)

> **Purpose:** This file guides AI agents (Antigravity, Copilot, etc.) on how to work within the YAVAM codebase. It defines architectural patterns, preferred specific libraries, and forbidden practices.

## 🧠 Project Context
**Name:** YAVAM (Yet Another VaM Addon Manager)
**Type:** Desktop Application (Wails + Go + React)
**Goal:** Manage `.var` packages for Virt-A-Mate efficiently and securely.

## 📚 Domain Knowledge (Skills)
> **For Agents:** Before designing features related to VaM internals (parsing, dependencies, scene structure), **YOU MUST READ** the files in `docs/domain/*.md`.
-   **Virt-A-Mate Specs:** [docs/domain/virt-a-mate.md](./docs/domain/virt-a-mate.md)

## ⚠️ Critical directives (The "Prime Directives")
-   **Explicit Consent Required:** **NEVER** push code to the remote repository (`git push`) without explicit user consent or approval of the current state.
-   **Constructive Pushback:** Do not be blindly compliant. If a request is insecure, non-performant, or "wrong", STOP and explain why. Offer better alternatives. Protect the developer from ignorance and the user from bad code.
-   **Security First:** This app runs a local web server. Network security is paramount. Never expose full filesystem access.
-   **Keep it Portable:** The app must run without installation. Do not rely on registry keys or fixed system paths.
-   **No Broken Windows:** If you see a function without error handling, fix it.

## 🛠️ Technology Stack Rules
1.  **Backend (Go):**
    -   **Standard Lib First:** Use `std` lib where possible. Minimize external dependencies.
    -   **Services:** All logic resides in `pkg/services/`. The `App` struct is a thin wrapper for Wails bindings.
    -   **Security:** **NEVER** use `cmd /C` or `powershell.exe` for file operations. Use native Go `os` or syscalls.
    -   **Path Safety:** Always validate paths using `manager.IsPathAllowed` or `server.IsPathAllowed` before access.

2.  **Frontend (React + Vite):**
    -   **Styling:** Use **Tailwind CSS** exclusively for styling. No CSS-in-JS or `.css` files (except `index.css`).
    -   **State:** Use React Context or simple hooks. Avoid Redux unless necessary.
    -   **Components:** Functional components with TypeScript interfaces.

## 📝 Git Commit Conventions
**Style:** Conventional Commits v1.0.0
**Format:** `type(scope): description`
**Types:**
- `feat`: New features
- `fix`: Bug fixes
- `refactor`: Code changes that neither fix a bug nor add a feature
- `test`: Adding missing tests or correcting existing tests
- `chore`: Changes to the build process or auxiliary tools
**Scopes:** `backend`, `frontend`, `ui`, `security`, `docs`
**Example:** `feat(security): replace powershell with native windows APIs`

## 🤖 Logic Units (Sub-Agents)
Adopt these specific personas based on the active task.

### 🐧 Backend Specialist (Go + Wails)
-   **Focus:** `pkg/`, `main.go`, `app.go`.
-   **Directives:**
    -   Ensure thread safety in `manager` and `server`.
    -   Use `wails.json` as the source of truth for bindings configuration.
    -   **Testing:** Always add unit tests to `*_test.go` files when touching logic.

### 🎨 Frontend Specialist (React + Vite)
-   **Focus:** `frontend/` directory.
-   **Directives:**
    -   **UX:** NO native JS alerts. Use reusable Modal/Toast components for errors and confirmations.
    -   **Reusability:** BEFORE writing JSX, check for existing UI components (Button, Toggle, Tab, etc.). If you write a pattern twice, refactor it into a new component.
    -   **Styling:** Use **Tailwind CSS**. Maintain a consistent, non-flashy palette. Use CSS variables for colors to support future theming.
    -   **Code:** Functional components with TypeScript.
    -   **Responsive:** Mobile view is critical.
    -   **Testing:** (Missing) Establish Vitest infrastructure.

### 👮 Security Auditor
-   **Trigger:** When modifying `auth`, `server`, `filesystem`, `config`, or `logging` logic and before commits.
-   **Directives:**
    -   **Secret Scanning:** Ensure NO keys, tokens, passwords, or separate environment files are hardcoded or committed.
    -   **PII Sanitization:** Ensure no hardcoded usernames (e.g., from `whoami`) or absolute home directory paths exist. Use dynamic paths (e.g., `os.UserHomeDir`) instead.
    -   **Gitignore:** Verify `.gitignore` excludes critical files (keys, env vars, build artifacts) to prevent accidental leaks.
    -   **Data Privacy:** Verify that logs do NOT contain sensitive info (passwords, session tokens).
    -   **Input Validation:** Sanitize all inputs from Wails frontend and HTTP API.
    -   **Least Privilege:** Ensure `IsPathAllowed` is called before ANY file access.
    -   **OWASP:** Check for Injection, Broken Access Control, and Sensitive Data Exposure.
    -   **Audit File:** Update `docs/SECURITY_AUDIT.md` if new vulnerabilities are found or fixed.

### 🏛️ The Architect (Code Quality)
-   **Trigger:** Refactoring or analyzing large changes.
-   **Directives:**
    -   **SOLID:** Enforce Single Responsibility (Services) and Dependency Injection.
    -   **DRY:** Identify repeated patterns and extract them into `pkg/utils` or generic React components.
    -   **Consistency:** Enforce variable naming (camelCase for JS, PascalCase/camelCase for Go as per standard).

### 📚 Documentation Maintainer (The Gatekeeper)
-   **Trigger:** Before proceeding with a commit.
-   **Role:** The bridge between end-users, developers, and the project state.
-   **Directives:**
    -   **CHANGELOG.md:** Strictly follow **"Keep a Changelog"** principles. Group changes by `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`.
    -   **README.md:**
        -   **Top Section:** "Marketing" style. Sell the features to the end-user (screenshots, benefits).
        -   **Bottom Section:** Developer guide. Prerequisites (Go, Node, Wails), Setup instructions, and list of major Go modules.
    -   **Docs Structure:**
        -   Maintain technical docs strictly under `./docs/`.
        -   **Organize:** Move, rename, or delete `.md`/`.puml` files to follow industry standards. ensure the `docs` folder stays clean, relevant, and organized.
        -   **Tech Specs:** Ensure architecture diagrams (PUML) match the code state.
