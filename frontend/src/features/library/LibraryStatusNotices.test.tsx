import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBanner, NoLibrariesNotice } from './LibraryStatusNotices';

describe('NoLibrariesNotice', () => {
    it('offers to add a library where the app can', () => {
        const onAddLibrary = vi.fn();
        render(<NoLibrariesNotice onAddLibrary={onAddLibrary} />);

        fireEvent.click(screen.getByRole('button', { name: /add library/i }));

        expect(onAddLibrary).toHaveBeenCalledTimes(1);
    });

    it('only points to the host where a library cannot be added', () => {
        render(<NoLibrariesNotice />);

        expect(screen.queryByRole('button')).toBeNull();
        expect(screen.getByText(/ask whoever runs YAVAM/i)).toBeTruthy();
    });
});

describe('ErrorBanner', () => {
    it('retries from the banner', () => {
        const onAction = vi.fn();
        render(<ErrorBanner message="Couldn't load your libraries." actionLabel="Retry" onAction={onAction} />);

        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

        expect(onAction).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('alert').textContent).toContain("Couldn't load your libraries.");
    });

    it('has no button when there is nothing to retry', () => {
        render(<ErrorBanner message="Library Access Error: nope" />);

        expect(screen.queryByRole('button')).toBeNull();
    });
});
