import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithAuth } from '../../services/api';
import * as authService from '../../services/auth';

// Mock Modules
vi.mock('../../services/auth', async (importOriginal) => {
    const actual = await importOriginal<typeof authService>();
    return {
        ...actual,
        getStoredToken: vi.fn(),
        logout: vi.fn(),
    };
});

describe('Auth Regression (Server Switching Loop)', () => {
    const reloadMock = vi.fn();

    beforeEach(() => {
        // Mock Window Reload
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { reload: reloadMock },
        });

        // Mock Fetch
        globalThis.fetch = vi.fn();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should trigger reload loop if 401 occurs with stale token', async () => {
        // 1. Simulate "Server A" Token present
        vi.mocked(authService.getStoredToken).mockReturnValue('stale_token_from_server_a');

        // 2. Simulate "Server B" rejecting it (401)
        vi.mocked(globalThis.fetch).mockResolvedValue({
            ok: false,
            status: 401,
            json: async () => ({}),
        } as Response);

        // 3. Attempt API Call
        await fetchWithAuth('/api/packages');

        // 4. Assert: Correct Behavior
        // The service calls logout...
        expect(authService.logout).toHaveBeenCalled();

        // BUT does NOT trigger reload (Fix Verification)
        expect(reloadMock).not.toHaveBeenCalled();
    });
});
