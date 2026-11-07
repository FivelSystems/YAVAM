
// Authentication flow for web/mobile clients. The desktop app never goes through here.
// NOTE: the local server speaks plain HTTP, so anything typed here (password or
// pairing code) travels unencrypted on the local network. That is why pairing
// codes are short-lived and one-time, and remote password login is opt-in.

const AUTH_KEY = 'yavam_auth_token';
export const DEVICE_ID_KEY = 'yavam_device_id';
const DEVICE_ID_BYTES = 16;
const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
let cachedToken: string | null = null;

const DEFAULT_RETRY_AFTER_SECONDS = 30;
const MAX_RETRY_AFTER_SECONDS = 3600;
const PAIRING_CODE_GROUP_LENGTH = 4;
const PAIRING_CODE_LENGTH = PAIRING_CODE_GROUP_LENGTH * 2;

export interface User {
    username: string;
    role: string;
}

export interface AuthStatus {
    setupRequired: boolean;
    passwordLoginAllowed: boolean;
    pairingAvailable: boolean;
}

export type AuthErrorCode =
    | 'RATE_LIMIT'
    | 'INVALID_CREDENTIALS'
    | 'INVALID_CODE'
    | 'PASSWORD_LOGIN_DISABLED'
    | 'SETUP_REQUIRED'
    | 'HOST_NOT_ALLOWED'
    | 'CLIENT_ERROR'
    | 'SERVER_ERROR'
    | 'NETWORK_ERROR';

// Checks if we have any token stored (does not validate it)
export function getStoredToken(): string | null {
    if (cachedToken) return cachedToken;
    return localStorage.getItem(AUTH_KEY);
}

export function isAuthenticated(): boolean {
    return !!getStoredToken();
}

export function logout() {
    cachedToken = null;
    localStorage.removeItem(AUTH_KEY);
    // Dispatch event so App can react immediately
    window.dispatchEvent(new Event('auth:logout'));
}

export class AuthError extends Error {
    constructor(public code: AuthErrorCode, message: string, public retryAfter?: number) {
        super(message);
        this.name = 'AuthError';
    }
}

function storeToken(token: string) {
    cachedToken = token;
    localStorage.setItem(AUTH_KEY, token);
    // Other parts of the app (like the Wails polyfill) react to this event
    window.dispatchEvent(new Event('auth:login'));
}

function parseRetryAfterSeconds(response: Response): number {
    const seconds = parseInt(response.headers?.get('Retry-After') ?? '', 10);
    if (!Number.isFinite(seconds) || seconds <= 0) return DEFAULT_RETRY_AFTER_SECONDS;
    return Math.min(seconds, MAX_RETRY_AFTER_SECONDS);
}

function rateLimitError(response: Response, message: string): AuthError {
    return new AuthError('RATE_LIMIT', message, parseRetryAfterSeconds(response));
}

const SETUP_REQUIRED_MESSAGE = 'An administrator password must be set from the desktop app first.';
const PASSWORD_LOGIN_DISABLED_MESSAGE = 'Password sign-in is disabled for other devices. Pair this device with a code from the desktop app.';

const HOST_NOT_ALLOWED_MESSAGE = 'This address is not allowed by the server. Open YAVAM using the address shown in the desktop app, or ask the owner to allow this host.';
const CLIENT_ERROR_MESSAGE = 'The server rejected the request. Reload the page and try again.';

const HTTP_UNSUPPORTED_MEDIA_TYPE = 415;
const HTTP_MISDIRECTED_REQUEST = 421;

function requestRefusalError(status: number): AuthError | null {
    if (status === HTTP_MISDIRECTED_REQUEST) return new AuthError('HOST_NOT_ALLOWED', HOST_NOT_ALLOWED_MESSAGE);
    if (status === HTTP_UNSUPPORTED_MEDIA_TYPE) return new AuthError('CLIENT_ERROR', CLIENT_ERROR_MESSAGE);
    return null;
}

// Stable per-browser identity so a new sign-in replaces only this device's previous session.
// Storage can be unavailable (private mode, blocked); then no id is sent and nothing is replaced.
export function getDeviceId(): string | undefined {
    try {
        const stored = localStorage.getItem(DEVICE_ID_KEY);
        if (stored && DEVICE_ID_PATTERN.test(stored)) return stored;
        const bytes = crypto.getRandomValues(new Uint8Array(DEVICE_ID_BYTES));
        const generated = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
        localStorage.setItem(DEVICE_ID_KEY, generated);
        return generated;
    } catch {
        return undefined;
    }
}

function rethrowAsAuthError(err: unknown, action: string): never {
    if (err instanceof AuthError) throw err;
    console.error(`${action} failed:`, err);
    throw new AuthError('NETWORK_ERROR', 'Unable to reach the server. Check your connection.');
}

// Unauthenticated probe; deliberately native fetch so a refusal can never trigger the 401 interceptor.
export async function getAuthStatus(): Promise<AuthStatus> {
    try {
        const response = await fetch('/api/auth/status', { cache: 'no-store' });
        if (!response.ok) {
            throw new AuthError('SERVER_ERROR', `Could not load sign-in options (${response.status}).`);
        }
        const status = await response.json();
        return {
            setupRequired: !!status.setupRequired,
            passwordLoginAllowed: !!status.passwordLoginAllowed,
            pairingAvailable: !!status.pairingAvailable,
        };
    } catch (err) {
        rethrowAsAuthError(err, 'Auth status');
    }
}

export function normalizePairingCode(input: string): string {
    return input.replace(/\s+/g, '').toUpperCase();
}

// Live formatting for the code field: letters/digits only, grouped as XXXX-XXXX.
export function formatPairingCodeInput(input: string): string {
    const symbols = input.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, PAIRING_CODE_LENGTH);
    if (symbols.length <= PAIRING_CODE_GROUP_LENGTH) return symbols;
    return `${symbols.slice(0, PAIRING_CODE_GROUP_LENGTH)}-${symbols.slice(PAIRING_CODE_GROUP_LENGTH)}`;
}

export function isCompletePairingCode(input: string): boolean {
    return input.replace(/[^a-zA-Z0-9]/g, '').length === PAIRING_CODE_LENGTH;
}

export async function pairWithCode(code: string, deviceName: string = describeThisDevice()): Promise<string> {
    try {
        const response = await fetch('/api/auth/pair', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: normalizePairingCode(code), deviceName, deviceId: getDeviceId() })
        });

        if (!response.ok) {
            const refusal = requestRefusalError(response.status);
            if (refusal) throw refusal;
            switch (response.status) {
                case 401:
                    throw new AuthError('INVALID_CODE', 'That code is incorrect or has expired. Generate a new one in the desktop app.');
                case 403:
                    throw new AuthError('PASSWORD_LOGIN_DISABLED', 'This device is not allowed to pair.');
                case 429:
                    throw rateLimitError(response, 'Too many attempts. Please wait a moment and try again.');
                case 503:
                    throw new AuthError('SETUP_REQUIRED', SETUP_REQUIRED_MESSAGE);
                default:
                    throw new AuthError('SERVER_ERROR', 'Pairing failed. Please try again.');
            }
        }

        const { token } = await response.json();
        storeToken(token);
        return token;
    } catch (err) {
        rethrowAsAuthError(err, 'Pairing');
    }
}

export async function login(password: string): Promise<string> {
    const username = "admin"; // Hardcoded for single-user v1

    try {
        const loginRes = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, deviceName: describeThisDevice(), deviceId: getDeviceId() })
        });

        if (loginRes.status === 429) {
            throw rateLimitError(loginRes, 'Too many login attempts. Please wait a moment.');
        }

        if (!loginRes.ok) {
            const refusal = requestRefusalError(loginRes.status);
            if (refusal) throw refusal;
            switch (loginRes.status) {
                case 401:
                    throw new AuthError('INVALID_CREDENTIALS', 'Incorrect password.');
                case 403:
                    throw new AuthError('PASSWORD_LOGIN_DISABLED', PASSWORD_LOGIN_DISABLED_MESSAGE);
                case 503:
                    throw new AuthError('SETUP_REQUIRED', SETUP_REQUIRED_MESSAGE);
                default:
                    throw new AuthError('SERVER_ERROR', `Login failed: ${loginRes.statusText}`);
            }
        }

        const { token } = await loginRes.json();
        storeToken(token);
        return token;

    } catch (err) {
        rethrowAsAuthError(err, 'Login');
    }
}

function describeThisDevice(): string {
    return `${getBrowserName()} (${getOSName()})`;
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
