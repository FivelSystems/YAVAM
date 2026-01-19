
// This service handles the Authentication flow (Simple Password)
// NOTE: Since this is a local desktop app, we send password over "HTTPS" (or localhost) directly.
// The backend handles bcrypt hashing.

const AUTH_KEY = 'yavam_auth_token';

export interface User {
    username: string;
    role: string;
}

// Checks if we have any token stored (does not validate it)
export function getStoredToken(): string | null {
    return localStorage.getItem(AUTH_KEY);
}

export function isAuthenticated(): boolean {
    return !!getStoredToken();
}

export function logout() {
    localStorage.removeItem(AUTH_KEY);
    // Reload to reset app state or let the App component handle it by checking event?
    // Dispatch event so App can react immediately
    window.dispatchEvent(new Event('auth:logout'));
}

export class AuthError extends Error {
    constructor(public code: 'RATE_LIMIT' | 'INVALID_CREDENTIALS' | 'SERVER_ERROR' | 'NETWORK_ERROR', message: string, public retryAfter?: number) {
        super(message);
        this.name = 'AuthError';
    }
}

export async function login(password: string): Promise<string> {
    const username = "admin"; // Hardcoded for single-user v1

    try {
        const deviceName = `${getBrowserName()} (${getOSName()})`;

        const loginRes = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, deviceName })
        });

        if (loginRes.status === 429) {
            throw new AuthError('RATE_LIMIT', 'Too many login attempts. Please wait a moment.');
        }

        if (!loginRes.ok) {
            if (loginRes.status === 401) {
                throw new AuthError('INVALID_CREDENTIALS', 'Incorrect password.');
            }
            throw new AuthError('SERVER_ERROR', `Login failed: ${loginRes.statusText}`);
        }

        const { token } = await loginRes.json();

        // Store Token
        localStorage.setItem(AUTH_KEY, token);

        return token;

    } catch (err: any) {
        if (err instanceof AuthError) throw err;
        console.error("Login failed:", err);
        throw new AuthError('NETWORK_ERROR', 'Unable to reach the server. Check your connection.');
    }
}

// Helper functions for device identification
function getBrowserName() {
    const ua = navigator.userAgent;
    if (ua.includes("Firefox")) return "Firefox";
    if (ua.includes("SamsungBrowser")) return "Samsung Internet";
    if (ua.includes("Opera") || ua.includes("OPR")) return "Opera";
    if (ua.includes("Trident")) return "Internet Explorer";
    if (ua.includes("Edge")) return "Edge";
    if (ua.includes("Chrome")) return "Chrome";
    if (ua.includes("Safari")) return "Safari";
    return "Unknown Browser";
}

function getOSName() {
    const ua = navigator.userAgent;
    if (ua.includes("Win")) return "Windows";
    if (ua.includes("Mac")) return "MacOS";
    if (ua.includes("Linux")) return "Linux";
    if (ua.includes("Android")) return "Android";
    if (ua.includes("iOS")) return "iOS";
    return "Unknown OS";
}
