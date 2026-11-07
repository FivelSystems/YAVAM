import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithAuth } from './api';
import { stubMemoryLocalStorage } from '../test/memoryStorage';

const TOKEN_KEY = 'yavam_auth_token';

describe('fetchWithAuth 401 handling', () => {
    let store: Map<string, string>;
    let logoutEvents: number;
    const countLogoutEvent = () => { logoutEvents++; };

    beforeEach(() => {
        store = stubMemoryLocalStorage();
        logoutEvents = 0;
        window.addEventListener('auth:logout', countLogoutEvent);
        vi.spyOn(console, 'warn').mockImplementation(() => { });
    });

    afterEach(() => {
        window.removeEventListener('auth:logout', countLogoutEvent);
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('logs out once when several in-flight requests are all rejected', async () => {
        store.set(TOKEN_KEY, 'dead-token');
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));

        await Promise.all([
            fetchWithAuth('/api/packages'),
            fetchWithAuth('/api/library/counts'),
            fetchWithAuth('/api/contents'),
        ]);

        expect(logoutEvents).toBe(1);
        expect(store.has(TOKEN_KEY)).toBe(false);
    });
});
