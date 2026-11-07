import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LoginModal from './LoginModal';
import { stubMemoryLocalStorage } from '../../test/memoryStorage';
import type { AuthStatus } from '../../services/auth';

function jsonResponse(status: number, body: unknown = {}, headers: Record<string, string> = {}) {
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: 'status',
        headers: new Headers(headers),
        json: async () => body,
    } as Response;
}

function mockServer(status: AuthStatus, pairResponse?: Response) {
    vi.mocked(globalThis.fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === '/api/auth/status') return jsonResponse(200, status);
        if (url === '/api/auth/pair' && pairResponse) return pairResponse;
        throw new Error(`unexpected request to ${url}`);
    });
}

function renderModal() {
    const onClose = vi.fn();
    render(
        <MemoryRouter>
            <LoginModal isOpen force onClose={onClose} />
        </MemoryRouter>
    );
    return onClose;
}

const OPEN: AuthStatus = { setupRequired: false, passwordLoginAllowed: true, pairingAvailable: true };

describe('LoginModal', () => {
    beforeEach(() => {
        stubMemoryLocalStorage();
        globalThis.fetch = vi.fn();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('shows the pairing code field before the password field', async () => {
        mockServer(OPEN);
        renderModal();

        const pairing = await screen.findByLabelText(/pairing code/i);
        const password = screen.getByLabelText(/access password/i);

        expect(pairing.compareDocumentPosition(password) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(screen.getByText(/Settings > Network/)).toBeInTheDocument();
    });

    it('hides the password form unless password sign-in is allowed', async () => {
        mockServer({ ...OPEN, passwordLoginAllowed: false });
        renderModal();

        await screen.findByLabelText(/pairing code/i);
        expect(screen.queryByLabelText(/access password/i)).not.toBeInTheDocument();
    });

    describe('password-unavailable hint', () => {
        const HINT = /password sign-in is turned off for other devices/i;

        it('explains why when password sign-in is not allowed', async () => {
            mockServer({ ...OPEN, passwordLoginAllowed: false });
            renderModal();

            expect(await screen.findByText(HINT)).toBeInTheDocument();
        });

        it('is hidden when password sign-in is allowed', async () => {
            mockServer(OPEN);
            renderModal();

            await screen.findByLabelText(/access password/i);
            expect(screen.queryByText(HINT)).not.toBeInTheDocument();
        });

        it('is hidden on the setup-required screen', async () => {
            mockServer({ setupRequired: true, passwordLoginAllowed: false, pairingAvailable: false });
            renderModal();

            await screen.findByText(/setup required/i);
            expect(screen.queryByText(HINT)).not.toBeInTheDocument();
        });

        it('includes the current port in the localhost suggestion', async () => {
            vi.stubGlobal('location', { ...window.location, port: '8765' });
            mockServer({ ...OPEN, passwordLoginAllowed: false });
            renderModal();

            expect(await screen.findByText(/http:\/\/localhost:8765/)).toBeInTheDocument();
        });

        it('omits the localhost suggestion when there is no port', async () => {
            vi.stubGlobal('location', { ...window.location, port: '' });
            mockServer({ ...OPEN, passwordLoginAllowed: false });
            renderModal();

            expect(await screen.findByText(HINT)).toBeInTheDocument();
            expect(screen.queryByText(/localhost/)).not.toBeInTheDocument();
        });
    });

    it('shows a static setup-required screen with no form', async () => {
        mockServer({ setupRequired: true, passwordLoginAllowed: false, pairingAvailable: false });
        renderModal();

        expect(await screen.findByText(/administrator password must be set from the desktop app first/i)).toBeInTheDocument();
        expect(screen.queryByLabelText(/pairing code/i)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/access password/i)).not.toBeInTheDocument();
        expect(document.querySelector('form')).toBeNull();
    });

    it('does not poll the status endpoint', async () => {
        mockServer({ setupRequired: true, passwordLoginAllowed: false, pairingAvailable: false });
        renderModal();

        await screen.findByText(/setup required/i);
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('formats the typed code and keeps submit disabled until complete', async () => {
        mockServer(OPEN);
        renderModal();

        const input = await screen.findByLabelText(/pairing code/i);
        fireEvent.change(input, { target: { value: 'abcd23' } });
        expect(input).toHaveValue('ABCD-23');
        expect(screen.getByRole('button', { name: /pair this device/i })).toBeDisabled();

        fireEvent.change(input, { target: { value: 'abcd2345' } });
        expect(screen.getByRole('button', { name: /pair this device/i })).toBeEnabled();
    });

    it('shows a calm retry message and countdown on 429', async () => {
        mockServer(OPEN, jsonResponse(429, {}, { 'Retry-After': '12' }));
        renderModal();

        fireEvent.change(await screen.findByLabelText(/pairing code/i), { target: { value: 'ABCD2345' } });
        fireEvent.click(screen.getByRole('button', { name: /pair this device/i }));

        expect(await screen.findByText(/too many attempts/i)).toBeInTheDocument();
        await waitFor(() => expect(screen.getAllByText(/try again in 1[012]s/i).length).toBeGreaterThan(0));
        expect(screen.getByLabelText(/pairing code/i)).toBeDisabled();
    });

    it('shows the specific message for a rejected code', async () => {
        mockServer(OPEN, jsonResponse(401, { success: false, message: 'Invalid or expired code' }));
        renderModal();

        fireEvent.change(await screen.findByLabelText(/pairing code/i), { target: { value: 'ABCD2345' } });
        fireEvent.click(screen.getByRole('button', { name: /pair this device/i }));

        expect(await screen.findByText(/incorrect or has expired/i)).toBeInTheDocument();
    });

    it('closes with the token after a successful pairing', async () => {
        mockServer(OPEN, jsonResponse(200, { success: true, token: 'tok' }));
        const onClose = renderModal();

        fireEvent.change(await screen.findByLabelText(/pairing code/i), { target: { value: 'ABCD2345' } });
        fireEvent.click(screen.getByRole('button', { name: /pair this device/i }));

        await waitFor(() => expect(onClose).toHaveBeenCalledWith('tok'));
    });
});
