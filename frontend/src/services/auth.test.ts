import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { stubMemoryLocalStorage } from '../test/memoryStorage';
import {
    pairWithCode,
    login,
    getAuthStatus,
    normalizePairingCode,
    formatPairingCodeInput,
    isCompletePairingCode,
    AuthError,
} from './auth';

function respond(status: number, body: unknown = {}, headers: Record<string, string> = {}) {
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: 'status',
        headers: new Headers(headers),
        json: async () => body,
    } as Response;
}

async function errorOf(promise: Promise<unknown>): Promise<AuthError> {
    try {
        await promise;
    } catch (err) {
        return err as AuthError;
    }
    throw new Error('expected the call to fail');
}

describe('pairing code helpers', () => {
    it('normalises by uppercasing and stripping whitespace', () => {
        expect(normalizePairingCode(' abcd 2345 ')).toBe('ABCD2345');
        expect(normalizePairingCode('abcd-2345')).toBe('ABCD-2345');
    });

    it('formats typed input as XXXX-XXXX and caps the length', () => {
        expect(formatPairingCodeInput('abc')).toBe('ABC');
        expect(formatPairingCodeInput('abcd2')).toBe('ABCD-2');
        expect(formatPairingCodeInput('ab cd-23 45 999')).toBe('ABCD-2345');
    });

    it('knows when the code is complete', () => {
        expect(isCompletePairingCode('ABCD-234')).toBe(false);
        expect(isCompletePairingCode('ABCD-2345')).toBe(true);
    });
});

describe('pairWithCode', () => {
    let store: Map<string, string>;

    beforeEach(() => {
        store = stubMemoryLocalStorage();
        globalThis.fetch = vi.fn();
        vi.spyOn(window, 'dispatchEvent');
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('stores the token and dispatches auth:login on success', async () => {
        vi.mocked(globalThis.fetch).mockResolvedValue(respond(200, { success: true, token: 'paired-token' }));

        const token = await pairWithCode('abcd 2345', 'phone');

        expect(token).toBe('paired-token');
        expect(store.get('yavam_auth_token')).toBe('paired-token');
        const events = vi.mocked(window.dispatchEvent).mock.calls.map(call => call[0].type);
        expect(events).toContain('auth:login');
    });

    it('sends the normalised code and device name', async () => {
        vi.mocked(globalThis.fetch).mockResolvedValue(respond(200, { token: 't' }));

        await pairWithCode(' abcd 2345', 'phone');

        const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0];
        expect(url).toBe('/api/auth/pair');
        expect(JSON.parse((init as RequestInit).body as string)).toEqual({ code: 'ABCD2345', deviceName: 'phone' });
    });

    it.each([
        [401, 'INVALID_CODE', /incorrect or has expired/],
        [403, 'PASSWORD_LOGIN_DISABLED', /not allowed to pair/],
        [429, 'RATE_LIMIT', /Too many attempts/],
        [503, 'SETUP_REQUIRED', /administrator password must be set from the desktop app/],
        [500, 'SERVER_ERROR', /Pairing failed/],
    ])('maps HTTP %i to %s', async (status, code, message) => {
        vi.mocked(globalThis.fetch).mockResolvedValue(respond(status));

        const error = await errorOf(pairWithCode('ABCD-2345', 'phone'));

        expect(error.code).toBe(code);
        expect(error.message).toMatch(message);
        expect(store.size).toBe(0);
    });

    it('carries Retry-After on 429 and defaults when absent', async () => {
        vi.mocked(globalThis.fetch).mockResolvedValueOnce(respond(429, {}, { 'Retry-After': '42' }));
        expect((await errorOf(pairWithCode('ABCD-2345', 'p'))).retryAfter).toBe(42);

        vi.mocked(globalThis.fetch).mockResolvedValueOnce(respond(429));
        expect((await errorOf(pairWithCode('ABCD-2345', 'p'))).retryAfter).toBe(30);
    });

    it('reports a network failure', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => { });
        vi.mocked(globalThis.fetch).mockRejectedValue(new TypeError('offline'));

        expect((await errorOf(pairWithCode('ABCD-2345', 'p'))).code).toBe('NETWORK_ERROR');
    });
});

describe('login refusals', () => {
    beforeEach(() => {
        stubMemoryLocalStorage();
        globalThis.fetch = vi.fn();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it.each([
        [403, 'PASSWORD_LOGIN_DISABLED'],
        [503, 'SETUP_REQUIRED'],
        [401, 'INVALID_CREDENTIALS'],
        [429, 'RATE_LIMIT'],
    ])('maps HTTP %i to %s', async (status, code) => {
        vi.mocked(globalThis.fetch).mockResolvedValue(respond(status, {}, { 'Retry-After': '7' }));

        const error = await errorOf(login('secret'));

        expect(error.code).toBe(code);
        if (status === 429) expect(error.retryAfter).toBe(7);
    });
});

describe('getAuthStatus', () => {
    beforeEach(() => {
        globalThis.fetch = vi.fn();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns the sign-in options using a plain fetch', async () => {
        vi.mocked(globalThis.fetch).mockResolvedValue(
            respond(200, { setupRequired: false, passwordLoginAllowed: true, pairingAvailable: true })
        );

        expect(await getAuthStatus()).toEqual({ setupRequired: false, passwordLoginAllowed: true, pairingAvailable: true });
        const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
        expect((init as RequestInit).headers).toBeUndefined();
    });

    it('fails with a server error on a non-OK response', async () => {
        vi.mocked(globalThis.fetch).mockResolvedValue(respond(500));

        expect((await errorOf(getAuthStatus())).code).toBe('SERVER_ERROR');
    });
});
