import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
import { stubMemoryLocalStorage } from '../../test/memoryStorage';

const TOKEN_KEY = 'yavam_auth_token';
const POLL_INTERVAL_MS = 15000;

function AuthProbe() {
    const { isAuthenticated, isLoginModalOpen, loginMessage } = useAuth();
    return (
        <div>
            <span data-testid="authenticated">{String(isAuthenticated)}</span>
            <span data-testid="modal">{String(isLoginModalOpen)}</span>
            <span data-testid="message">{loginMessage ?? ''}</span>
        </div>
    );
}

describe('AuthProvider session revocation', () => {
    let store: Map<string, string>;
    let verifyStatus: number;
    let emitRevoked: () => void;
    let logoutEvents: number;
    const fetchMock = vi.fn();
    const eventsOff = vi.fn();

    const verifyCalls = () => fetchMock.mock.calls.filter(([url]) => url === '/api/auth/verify').length;
    const countLogoutEvent = () => { logoutEvents++; };

    beforeEach(() => {
        store = stubMemoryLocalStorage();
        store.set(TOKEN_KEY, 'live-token');
        verifyStatus = 200;
        logoutEvents = 0;
        fetchMock.mockReset();
        fetchMock.mockImplementation(async (url: string) => {
            if (url === '/api/auth/verify') return { ok: verifyStatus === 200, status: verifyStatus };
            return { ok: true, status: 200, json: async () => ({}) };
        });
        vi.stubGlobal('fetch', fetchMock);

        eventsOff.mockReset();
        window.runtime = {
            EventsOn: (name: string, callback: () => void) => {
                if (name === 'auth:revoked') emitRevoked = callback;
            },
            EventsOff: eventsOff,
        };
        window.addEventListener('auth:logout', countLogoutEvent);
    });

    afterEach(() => {
        window.removeEventListener('auth:logout', countLogoutEvent);
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('returns to sign-in once when the revoked event ends this session', async () => {
        render(<AuthProvider><AuthProbe /></AuthProvider>);
        await waitFor(() => expect(screen.getByTestId('authenticated').textContent).toBe('true'));

        verifyStatus = 401;
        await act(async () => { emitRevoked(); });
        await act(async () => { emitRevoked(); });

        await waitFor(() => expect(screen.getByTestId('modal').textContent).toBe('true'));
        expect(screen.getByTestId('authenticated').textContent).toBe('false');
        expect(screen.getByTestId('message').textContent).toBe('Your session has been revoked by the server.');
        expect(store.has(TOKEN_KEY)).toBe(false);
        expect(logoutEvents).toBe(1);
    });

    it('stays signed in when the revoked event concerned another device', async () => {
        render(<AuthProvider><AuthProbe /></AuthProvider>);
        await waitFor(() => expect(screen.getByTestId('authenticated').textContent).toBe('true'));

        await act(async () => { emitRevoked(); });

        expect(screen.getByTestId('authenticated').textContent).toBe('true');
        expect(screen.getByTestId('modal').textContent).toBe('false');
        expect(logoutEvents).toBe(0);
    });

    it('stops polling for revocation after the session ended', async () => {
        render(<AuthProvider><AuthProbe /></AuthProvider>);
        await waitFor(() => expect(screen.getByTestId('authenticated').textContent).toBe('true'));

        vi.useFakeTimers();
        verifyStatus = 401;
        await act(async () => { emitRevoked(); });
        const callsAtLogout = verifyCalls();

        await act(async () => { await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 4); });

        expect(verifyCalls()).toBe(callsAtLogout);
    });

    it('unsubscribes from the revoked event on unmount', async () => {
        const { unmount } = render(<AuthProvider><AuthProbe /></AuthProvider>);
        await waitFor(() => expect(screen.getByTestId('authenticated').textContent).toBe('true'));

        unmount();

        expect(eventsOff).toHaveBeenCalledWith('auth:revoked', emitRevoked);
    });
});
