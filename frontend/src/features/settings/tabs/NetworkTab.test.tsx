import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import NetworkTab from './NetworkTab';
import { stubMemoryLocalStorage } from '../../../test/memoryStorage';

const PAIRING_TTL_SECONDS = 120;

interface AppMock {
    ListSessions: ReturnType<typeof vi.fn>;
    IsServerRunning: ReturnType<typeof vi.fn>;
    GetRemoteAccessState: ReturnType<typeof vi.fn>;
    CreatePairingCode: ReturnType<typeof vi.fn>;
    SetAllowRemotePasswordLogin: ReturnType<typeof vi.fn>;
    SetServerBindAddress: ReturnType<typeof vi.fn>;
    RevokeSession: ReturnType<typeof vi.fn>;
}

function remoteState(overrides: Record<string, unknown> = {}) {
    return {
        hasCustomPassword: true,
        allowRemotePasswordLogin: false,
        serverBindAddress: 'loopback',
        pairing: { active: false, expiresAt: '' },
        ...overrides,
    };
}

function installApp(state = remoteState()): AppMock {
    const app: AppMock = {
        ListSessions: vi.fn().mockResolvedValue([]),
        IsServerRunning: vi.fn().mockResolvedValue(true),
        GetRemoteAccessState: vi.fn().mockResolvedValue(state),
        CreatePairingCode: vi.fn(),
        SetAllowRemotePasswordLogin: vi.fn().mockResolvedValue(undefined),
        SetServerBindAddress: vi.fn().mockResolvedValue(undefined),
        RevokeSession: vi.fn().mockResolvedValue(undefined),
    };
    // @ts-ignore
    window.go = { main: { App: app } };
    return app;
}

function renderTab() {
    return render(
        <NetworkTab
            serverEnabled
            onToggleServer={() => { }}
            serverPort="18888"
            setServerPort={() => { }}
            onStartServer={() => { }}
            onStopServer={() => { }}
            publicAccess={false}
            onTogglePublicAccess={() => { }}
            localIP="192.168.1.20"
            logs={[]}
            setLogs={() => { }}
            isWeb={false}
            authPollInterval={15}
            setAuthPollInterval={() => { }}
        />
    );
}

async function settle(milliseconds = 0) {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(milliseconds);
    });
}

describe('NetworkTab remote access', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
        Element.prototype.scrollIntoView = vi.fn();
    });

    afterEach(() => {
        vi.useRealTimers();
        // @ts-ignore
        delete window.go;
    });

    it('counts down a generated code and removes it at expiry', async () => {
        const app = installApp();
        const expiresAt = new Date(Date.now() + PAIRING_TTL_SECONDS * 1000).toISOString();
        app.CreatePairingCode.mockResolvedValue({ code: 'ABCD-2345', expiresAt });
        app.GetRemoteAccessState.mockResolvedValue(remoteState({ pairing: { active: true, expiresAt } }));
        renderTab();
        await settle();

        fireEvent.click(screen.getByRole('button', { name: /generate pairing code/i }));
        await settle();

        expect(screen.getByLabelText('Pairing code')).toHaveTextContent('ABCD-2345');
        expect(screen.getByText(/expires in 2:00/i)).toBeInTheDocument();
        expect(screen.getByText(/anyone on your network who enters this code/i)).toBeInTheDocument();

        await settle(30_000);
        expect(screen.getByText(/expires in 1:30/i)).toBeInTheDocument();

        await settle(PAIRING_TTL_SECONDS * 1000);
        expect(screen.queryByLabelText('Pairing code')).not.toBeInTheDocument();
        expect(screen.queryByText('ABCD-2345')).not.toBeInTheDocument();
        expect(screen.getByText(/the code expired/i)).toBeInTheDocument();
    });

    it('hides the code once the backend reports it is no longer active', async () => {
        const app = installApp();
        const expiresAt = new Date(Date.now() + PAIRING_TTL_SECONDS * 1000).toISOString();
        app.CreatePairingCode.mockResolvedValue({ code: 'ABCD-2345', expiresAt });
        renderTab();
        await settle();

        fireEvent.click(screen.getByRole('button', { name: /generate pairing code/i }));
        await settle();
        expect(screen.getByLabelText('Pairing code')).toBeInTheDocument();

        await settle(2500);
        expect(screen.queryByLabelText('Pairing code')).not.toBeInTheDocument();
    });

    it('never writes the code to localStorage', async () => {
        const app = installApp();
        const expiresAt = new Date(Date.now() + PAIRING_TTL_SECONDS * 1000).toISOString();
        app.CreatePairingCode.mockResolvedValue({ code: 'ABCD-2345', expiresAt });
        app.GetRemoteAccessState.mockResolvedValue(remoteState({ pairing: { active: true, expiresAt } }));
        const store = stubMemoryLocalStorage();
        renderTab();
        await settle();

        fireEvent.click(screen.getByRole('button', { name: /generate pairing code/i }));
        await settle();

        expect(screen.getByLabelText('Pairing code')).toBeInTheDocument();
        expect([...store.keys(), ...store.values()].join(' ')).not.toContain('ABCD-2345');
        vi.unstubAllGlobals();
    });

    it('disables pairing with an explanation when no custom password exists', async () => {
        installApp(remoteState({ hasCustomPassword: false }));
        renderTab();
        await settle();

        expect(screen.queryByRole('button', { name: /generate pairing code/i })).not.toBeInTheDocument();
        expect(screen.getByText(/set an administrator password first/i)).toBeInTheDocument();
    });

    it('defaults password sign-in to off and always shows the plaintext warning', async () => {
        installApp();
        renderTab();
        await settle();

        expect(screen.getByText(/sent unencrypted over the local network/i)).toBeInTheDocument();
        const row = screen.getByText('Allow password sign-in from other devices').closest('div.group') as HTMLElement;
        expect(row.querySelector('button')?.className).toContain('bg-gray-700');
    });

    it('turns password sign-in on through the backend', async () => {
        const app = installApp();
        renderTab();
        await settle();

        const row = screen.getByText('Allow password sign-in from other devices').closest('div.group') as HTMLElement;
        fireEvent.click(row.querySelector('button') as HTMLElement);
        await settle();

        expect(app.SetAllowRemotePasswordLogin).toHaveBeenCalledWith(true);
    });

    it('applies a specific bind address and shows a backend error verbatim', async () => {
        const app = installApp();
        const backendMessage = 'address 10.9.9.9 is not an address of this computer';
        app.SetServerBindAddress.mockRejectedValue(new Error(backendMessage));
        renderTab();
        await settle();

        fireEvent.click(screen.getByLabelText(/^a specific address/i));
        fireEvent.change(screen.getByLabelText('Specific listen address'), { target: { value: '10.9.9.9' } });
        fireEvent.click(screen.getByRole('button', { name: /^apply$/i }));
        await settle();

        expect(app.SetServerBindAddress).toHaveBeenCalledWith('10.9.9.9');
        expect(screen.getByRole('alert')).toHaveTextContent(backendMessage);
    });

    it('sends the keyword for the all-interfaces option', async () => {
        const app = installApp();
        renderTab();
        await settle();

        fireEvent.click(screen.getByLabelText(/all network interfaces/i));
        fireEvent.click(screen.getByRole('button', { name: /^apply$/i }));
        await settle();

        expect(app.SetServerBindAddress).toHaveBeenCalledWith('all');
    });
});
