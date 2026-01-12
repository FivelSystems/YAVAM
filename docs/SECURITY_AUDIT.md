# Security Audit Report: YAVAM
**Date:** 2026-01-11
**Auditor:** Antigravity (AI)
**Target:** Local Codebase (v1.2.x)

## 🚨 Critical Vulnerabilities (High Priority)

### 1. OS Command Injection (Generic)
**Severity:** **CRITICAL** (CVSS 9.8)
**CWE:** [CWE-78: Improper Neutralization of Special Elements used in an OS Command](https://cwe.mitre.org/data/definitions/78.html)

**Description:**
The application constructs operating system commands using external input (filenames, paths) without sufficient neutralization. Specifically, the use of `exec.Command("cmd", "/C", ...)` and PowerShell invocation allows an attacker (or a malicious filename) to execute arbitrary commands on the host system.

**Vulnerable Code Locations:**
-   `pkg/manager/manager.go`: `DeleteToTrash` function uses PowerShell.
-   `pkg/manager/manager.go`: `OpenFolder` uses `explorer.exe`.
-   `app.go`: `RestartApp` uses `cmd /C start`.

**Exploit Scenario:**
An attacker provides a file named `test.var; calc.exe`. When the application attempts to "Delete" this file, the command becomes `powershell -Command Remove-Item "test.var; calc.exe"`. PowerShell may interpret the semicolon and execute `calc.exe`.

**Remediation:**
**NEVER** use `cmd /C` or `powershell` to perform file operations that the Go standard library can handle.
-   **Replace** `DeleteToTrash` with native Win32 API calls (`shell32.dll` -> `SHFileOperation`) using `golang.org/x/sys/windows`.
-   **Replace** `OpenFolder` with `exec.Command("explorer", path)`. Note that `explorer` is generally safe *if* the path is the *only* argument, but validation is still recommended.
-   **Replace** `RestartApp` with a direct binary execution, avoiding `cmd`.

### 2. Path Traversal (Arbitrary File Access)
**Severity:** **HIGH** (CVSS 7.5)
**CWE:** [CWE-22: Improper Limitation of a Path to a Restricted Directory ('Path Traversal')](https://cwe.mitre.org/data/definitions/22.html)

**Description:**
The application serves files via a custom HTTP handler in `pkg/server/server.go`. While it attempts to use `filepath.Clean` and `strings.HasPrefix` to validate that a file belongs to a library, subtle implementation details (like case sensitivity mismatches on Windows, or "cleaning" logic flaws) can often be bypassed.

**Vulnerable Code Locations:**
-   `pkg/server/server.go`: `/files/` handler.
-   `pkg/server/server.go`: `/api/upload` endpoint.

**Exploit Scenario:**
An attacker requests `/files/..\..\Windows\System32\drivers\etc\hosts`. If the cleaning logic isn't perfect, the server might serve system files.

**Remediation:**
1.  **Canonicalize Paths:** Always resolve the *absolute* path of both the Request and the Root Directory using `filepath.EvalSymlinks`.
2.  **Strict Prefix Check:** Ensure `Clean(RequestPath)` strictly starts with `Clean(RootPath) + Separator`.
3.  **Use `http.Dir` wrapper:** Go's `http.Dir` has some built-in protections, but manual verification is safer for multi-root setups.

### 3. Unprotected Local Server (Local Network Exposure)
**Severity:** **HIGH** (CVSS 8.1)
**CWE:** [CWE-306: Missing Authentication for Critical Function](https://cwe.mitre.org/data/definitions/306.html)

**Description:**
The internal web server (`pkg/server`) binds to a port (likely `0.0.0.0` or `:port` implies all interfaces). Since there is no authentication mechanism, **anyone** on the same local network (Wi-Fi) can connect to your IP and trigger:
-   `/api/delete` (Delete your files)
-   `/api/upload` (Upload malware)
-   `/api/resolve` (Mess with your library)

**Remediation:**
1.  **Bind to Loopback:** Force the server to listen *only* on `127.0.0.1:PORT` unless remote usage is explicitly enabled by the user.
2.  **Token Authentication:** If remote access is needed, generate a random Session Token on startup. Display it in the Desktop App. Require this token in the `Authorization` header for all requests.

---

## 🔍 Recommended Auditing Tools
To further harden the codebase, execute these standard industry tools:

1.  **Govulncheck:** Google's vulnerability scanner for Go.
    ```bash
    go install golang.org/x/vuln/cmd/govulncheck@latest
    govulncheck ./...
    ```
2.  **Gosec:** Golang Security Checker (Static Analysis).
    ```bash
    go install github.com/securego/gosec/v2/cmd/gosec@latest
    gosec ./...
    ```
    *Expect `gosec` to scream about `G204` (Command Execution).*

---

## 🛡️ "Safety First" Roadmap
1.  **Immediate:** Fix Command Injection in `manager.go`.
2.  **Immediate:** Bind Server to `localhost`.
3.  **Short-term:** Implement `Bearer` token auth for the API.
4.  **Long-term:** Rewrite the file serving logic to use a hardened "FileSystem Sandbox" interface.
