import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { login } from '../../services/auth';

describe('Auth Login Event (Regression Test)', () => {
    beforeEach(() => {
        // Mock Fetch (Success)
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ token: 'mock-token' }),
        } as Response);

        // Spy on Dispatch Event
        vi.spyOn(window, 'dispatchEvent');

        // Mock LocalStorage
        vi.spyOn(Storage.prototype, 'setItem');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should dispatch auth:login event upon successful login', async () => {
        await login('password');

        // Verify Token Stored
        expect(localStorage.setItem).toHaveBeenCalledWith('yavam_auth_token', 'mock-token');

        // Verify Event Dispatched
        const calls = (window.dispatchEvent as any).mock.calls;
        const loginEvent = calls.find((c: any[]) => c[0].type === 'auth:login');

        expect(loginEvent).toBeDefined();
    });
});
