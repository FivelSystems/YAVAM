import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SecurityTab from './SecurityTab';

function installApp(updatePassword: ReturnType<typeof vi.fn>) {
    // @ts-ignore
    window.go = { main: { App: { UpdatePassword: updatePassword } } };
}

function openForm() {
    render(<SecurityTab handleClearData={vi.fn()} addToast={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /change password/i }));
}

function type(password: string) {
    fireEvent.change(screen.getByPlaceholderText('Enter new password'), { target: { value: password } });
    fireEvent.change(screen.getByPlaceholderText('Confirm new password'), { target: { value: password } });
}

describe('SecurityTab password change', () => {
    afterEach(() => {
        // @ts-ignore
        delete window.go;
    });

    it('blocks short passwords client-side', () => {
        installApp(vi.fn());
        openForm();

        type('short');

        expect(screen.getByText('The password must be at least 8 characters long.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /update password/i })).toBeDisabled();
    });

    it('blocks the default password client-side', () => {
        installApp(vi.fn());
        openForm();

        type('admin');

        expect(screen.getByText('Choose a password other than the default one.')).toBeInTheDocument();
    });

    it('shows backend validation errors verbatim', async () => {
        const update = vi.fn().mockRejectedValue('Choose a password other than the default one.');
        installApp(update);
        openForm();
        type('long enough pw');

        fireEvent.click(screen.getByRole('button', { name: /update password/i }));

        await waitFor(() => expect(screen.getByText('Choose a password other than the default one.')).toBeInTheDocument());
        expect(update).toHaveBeenCalledWith('long enough pw');
    });
});
