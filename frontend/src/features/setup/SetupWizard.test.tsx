import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SetupWizard from './SetupWizard';

function installApp(setPassword = vi.fn().mockResolvedValue(undefined)) {
    const app = {
        SetPassword: setPassword,
        FinishSetup: vi.fn().mockResolvedValue(undefined),
        SelectDirectory: vi.fn(),
    };
    // @ts-ignore
    window.go = { main: { App: app } };
    return app;
}

async function openPasswordStep() {
    render(<SetupWizard onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /skip/i }));
    await screen.findByLabelText('Administrator Password');
}

function typePasswords(password: string, confirmation = password) {
    fireEvent.change(screen.getByLabelText('Administrator Password'), { target: { value: password } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: confirmation } });
}

describe('SetupWizard password step', () => {
    afterEach(() => {
        // @ts-ignore
        delete window.go;
    });

    it('says remote access stays disabled when skipped', async () => {
        installApp();
        await openPasswordStep();

        expect(screen.getByText(/remote access stays disabled/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /skip for now/i })).toBeInTheDocument();
    });

    it('blocks short passwords with the backend wording', async () => {
        installApp();
        await openPasswordStep();

        typePasswords('short');

        expect(screen.getByRole('alert')).toHaveTextContent('The password must be at least 8 characters long.');
        expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
    });

    it('blocks the default password with the backend wording', async () => {
        installApp();
        await openPasswordStep();

        typePasswords('admin');

        expect(screen.getByRole('alert')).toHaveTextContent('Choose a password other than the default one.');
        expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
    });

    it('enables Next for a valid matching password', async () => {
        installApp();
        await openPasswordStep();

        typePasswords('long enough pw');

        expect(screen.getByRole('button', { name: /next/i })).toBeEnabled();
    });

    it('returns to the password step and shows the backend error on finish', async () => {
        const backendMessage = 'The password must be at least 8 characters long.';
        const app = installApp(vi.fn().mockRejectedValue(backendMessage));
        await openPasswordStep();
        typePasswords('long enough pw');
        fireEvent.click(screen.getByRole('button', { name: /next/i }));

        fireEvent.click(await screen.findByRole('button', { name: /finish setup/i }));

        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(backendMessage));
        expect(app.FinishSetup).not.toHaveBeenCalled();
    });
});

