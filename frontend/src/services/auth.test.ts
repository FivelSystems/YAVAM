import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { stubMemoryLocalStorage } from '../test/memoryStorage';
import {
    pairWithCode,
    login,
    getAuthStatus,
    normalizePairingCode,
    formatPairingCodeInput,
    isCompletePairingCode,
    getDeviceId,
    DEVICE_ID_KEY,
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
        expect(JSON.parse((init as RequestInit).body as string)).toEqual({ code: 'ABCD2345', deviceName: 'phone', deviceId: store.get(DEVICE_ID_KEY) });
        expect(store.get(DEVICE_ID_KEY)).toMatch(/^[0-9a-f]{32}$/);
    });

    it.each([
        [401, 'INVALID_CODE', /incorrect or has expired/],
        [403, 'PASSWORD_LOGIN_DISABLED', /not allowed to pair/],
        [429, 'RATE_LIMIT', /Too many attempts/],
        [503, 'SETUP_REQUIRED', /administrator password must be set from the desktop app/],
        [500, 'SERVER_ERROR', /Pairing failed/],
        [421, 'HOST_NOT_ALLOWED', /address is not allowed by the server/],
        [415, 'CLIENT_ERROR', /rejected the request/],
    ])('maps HTTP %i to %s', async (status, code, message) => {
        vi.mocked(globalThis.fetch).mockResolvedValue(respond(status));

        const error = await errorOf(pairWithCode('ABCD-2345', 'phone'));

        expect(error.code).toBe(code);
        expect(error.message).toMatch(message);
        expect(store.has('yavam_auth_token')).toBe(false);
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
        [421, 'HOST_NOT_ALLOWED'],
        [415, 'CLIENT_ERROR'],
    ])('maps HTTP %i to %s', async (status, code) => {
        vi.mocked(globalThis.fetch).mockResolvedValue(respond(status, {}, { 'Retry-After': '7' }));

        const error = await errorOf(login('secret'));

        expect(error.code).toBe(code);
        if (status === 429) expect(error.retryAfter).toBe(7);
    });
});

describe('login request', () => {
    beforeEach(() => {
        stubMemoryLocalStorage();
        globalThis.fetch = vi.fn().mockResolvedValue(respond(200, { token: 't' }));
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('sends the stable device id with the credentials', async () => {
        await login('secret');
        await login('secret');

        const bodies = vi.mocked(globalThis.fetch).mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string));
        expect(bodies[0].deviceId).toMatch(/^[0-9a-f]{32}$/);
        expect(bodies[1].deviceId).toBe(bodies[0].deviceId);
        expect(bodies[0].username).toBe('admin');
    });
});

describe('getDeviceId', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('generates the id once and reuses it', () => {
        const store = stubMemoryLocalStorage();
        const randomSpy = vi.spyOn(crypto, 'getRandomValues');

        const first = getDeviceId();
        const second = getDeviceId();

        expect(first).toBe(second);
        expect(store.get(DEVICE_ID_KEY)).toBe(first);
        expect(randomSpy).toHaveBeenCalledTimes(1);
    });

    it('replaces a stored value that is not a valid id', () => {
        const store = stubMemoryLocalStorage();
        store.set(DEVICE_ID_KEY, 'bad id!');

        const id = getDeviceId();

        expect(id).toMatch(/^[0-9a-f]{32}$/);
        expect(store.get(DEVICE_ID_KEY)).toBe(id);
    });

    it('returns no id when storage is unavailable', () => {
        vi.stubGlobal('localStorage', {
            getItem: () => { throw new Error('denied'); },
            setItem: () => { throw new Error('denied'); },
        });

        expect(getDeviceId()).toBeUndefined();
    });

    it('omits deviceId from the request body when storage is unavailable', async () => {
        vi.stubGlobal('localStorage', {
            getItem: () => { throw new Error('denied'); },
            setItem: () => { throw new Error('denied'); },
        });
        globalThis.fetch = vi.fn().mockResolvedValue(respond(200, { token: 't' }));

        await pairWithCode('ABCD-2345', 'phone').catch(() => undefined);

        const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
        expect(JSON.parse((init as RequestInit).body as string)).toEqual({ code: 'ABCD-2345', deviceName: 'phone' });
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
