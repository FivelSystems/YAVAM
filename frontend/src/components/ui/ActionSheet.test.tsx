import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActionSheet } from './ActionSheet';
import { VarPackage } from '../../types';

const pkg = {
    filePath: 'C:/lib/Creator.Pkg.1.var',
    fileName: 'Creator.Pkg.1.var',
    size: 100,
    isEnabled: true,
    isCorrupt: false,
    isDuplicate: false,
    isExactDuplicate: false,
    missingDeps: [],
    hasThumbnail: false,
    categories: [],
    rating: 3,
    isFavorite: false,
    scanPhase: 'analyzed',
    meta: { creator: 'Creator', packageName: 'Pkg', version: '1', dependencies: {} },
} as unknown as VarPackage;

const noopCallbacks = () => ({
    onToggle: vi.fn(),
    onOpenFolder: vi.fn(),
    onDownload: vi.fn(),
    onCopyPath: vi.fn(),
    onCopyFiles: vi.fn(),
    onCutFile: vi.fn(),
    onDelete: vi.fn(),
    onMerge: vi.fn(),
    onMergeInPlace: vi.fn(),
    onResolve: vi.fn(),
    onSetRating: vi.fn(),
    onSetFavorite: vi.fn(),
});

describe('ActionSheet — the mobile presentation of the package action menu', () => {
    it('renders nothing when pkg is null', () => {
        render(<ActionSheet pkg={null} onClose={vi.fn()} {...noopCallbacks()} />);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders as an accessible dialog with the package name, rating control, and action rows', () => {
        render(<ActionSheet pkg={pkg} onClose={vi.fn()} {...noopCallbacks()} />);

        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveAttribute('aria-modal', 'true');
        expect(screen.getByText('Pkg')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /disable/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument();
    });

    it('calls onClose when the backdrop is clicked', () => {
        const onClose = vi.fn();
        render(<ActionSheet pkg={pkg} onClose={onClose} {...noopCallbacks()} />);
        // Rendered via createPortal(document.body), so it's outside the render container.
        fireEvent.click(document.querySelector('.backdrop-blur-sm') as HTMLElement);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose on Escape', () => {
        const onClose = vi.fn();
        render(<ActionSheet pkg={pkg} onClose={onClose} {...noopCallbacks()} />);
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('runs the action and closes the sheet when a row is clicked', () => {
        const onClose = vi.fn();
        const cbs = noopCallbacks();
        render(<ActionSheet pkg={pkg} onClose={onClose} {...cbs} />);

        fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
        expect(cbs.onDelete).toHaveBeenCalledWith(pkg);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('persists a star rating via the shared rating control', () => {
        const cbs = noopCallbacks();
        render(<ActionSheet pkg={pkg} onClose={vi.fn()} {...cbs} />);

        fireEvent.click(screen.getByTitle('Rate 5 stars'));
        expect(cbs.onSetRating).toHaveBeenCalledWith(pkg, 5);
    });

    it('shows the full action list, not just rating/favourite, including on the web client', () => {
        // @ts-ignore
        delete window.go;
        render(<ActionSheet pkg={pkg} onClose={vi.fn()} {...noopCallbacks()} />);

        expect(screen.getByRole('button', { name: /install to library/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /download file/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /open folder/i })).not.toBeInTheDocument();
    });
});
