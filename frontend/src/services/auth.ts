
// This service handles the Challenge-Response Authentication flow
// It mimics the client-side hashing logic: SHA256(SHA256(Pass) + Nonce)

const AUTH_KEY = 'yavam_auth_token';

export interface User {
    username: string;
    role: string;
}

// Minimal pure JS SHA-256 implementation for insecure contexts (LAN HTTP)
function sha256_js(ascii: string) {
    function rightRotate(value: number, amount: number) {
        return (value >>> amount) | (value << (32 - amount));
    }

    const mathPow = Math.pow;
    const maxWord = mathPow(2, 32);
    const lengthProperty = 'length'
    let i, j;
    let result = ''

    const words: number[] = [];
    const asciiBitLength = ascii[lengthProperty] * 8;

    let hash = (sha256 as any).h = (sha256 as any).h || [];
    const k = (sha256 as any).k = (sha256 as any).k || [];
    let primeCounter = k[lengthProperty];

    const isComposite: any = {};
    for (let candidate = 2; primeCounter < 64; candidate++) {
        if (!isComposite[candidate]) {
            for (i = 0; i < 313; i += candidate) {
                isComposite[i] = candidate;
            }
            hash[primeCounter] = (mathPow(candidate, .5) * maxWord) | 0;
            k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
        }
    }

    ascii += '\x80'
    while (ascii[lengthProperty] % 64 - 56) ascii += '\x00'
    for (i = 0; i < ascii[lengthProperty]; i++) {
        j = ascii.charCodeAt(i);
        if (j >> 8) return ''; // ASCII check
        words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words[lengthProperty]] = ((asciiBitLength / maxWord) | 0);
    words[words[lengthProperty]] = (asciiBitLength)

    for (j = 0; j < words[lengthProperty];) {
        const w = words.slice(j, j += 16);
        const oldHash = hash;
        hash = hash.slice(0, 8);

        for (i = 0; i < 64; i++) {
            const w15 = w[i - 15], w2 = w[i - 2];
            const a = hash[0], e = hash[4];
            const temp1 = hash[7]
                + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
                + ((e & hash[5]) ^ ((~e) & hash[6]))
                + k[i]
                + (w[i] = (i < 16) ? w[i] : (
                    w[i - 16]
                    + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
                    + w[i - 7]
                    + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
                ) | 0
                );

            const temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
                + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));

            hash = [(temp1 + temp2) | 0].concat(hash);
            hash[4] = (hash[4] + temp1) | 0;
        }

        for (i = 0; i < 8; i++) {
            hash[i] = (hash[i] + oldHash[i]) | 0;
        }
    }

    for (i = 0; i < 8; i++) {
        for (j = 3; j + 1; j--) {
            const b = (hash[i] >> (j * 8)) & 255;
            result += ((b < 16) ? 0 : '') + b.toString(16);
        }
    }
    return result;
}

// Web Crypto SHA-256 Helper with Fallback
async function sha256(msg: string): Promise<string> {
    if (crypto && crypto.subtle && window.isSecureContext) {
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(msg);
            const hash = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hash));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            return hashHex;
        } catch (e) {
            console.warn("WebCrypto failed, falling back to JS implementation", e);
        }
    }
    // Fallback for non-secure context (LAN HTTP)
    return sha256_js(msg);
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
        // 1. Get Nonce
        const challengeRes = await fetch('/api/auth/challenge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });

        if (challengeRes.status === 429) {
            throw new AuthError('RATE_LIMIT', 'Too many login attempts. Please wait a moment.');
        }

        if (!challengeRes.ok) {
            throw new AuthError('SERVER_ERROR', 'Failed to communicate with authentication server.');
        }

        const { nonce } = await challengeRes.json();
        if (!nonce) throw new AuthError('SERVER_ERROR', 'Invalid server response (missing nonce).');

        // 2. Calculate Proof
        // H1 = SHA256(password)
        const h1 = await sha256(password);

        // Proof = SHA256(H1 + Nonce)
        const proof = await sha256(h1 + nonce);

        // 3. Complete Login
        const deviceName = `${getBrowserName()} (${getOSName()})`;
        const loginRes = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, nonce, proof, deviceName })
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
