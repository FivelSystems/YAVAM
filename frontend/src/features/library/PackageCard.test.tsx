import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PackageCard from './PackageCard';
import { VarPackage } from '../../types';

const makePkg = (overrides: Partial<VarPackage> = {}): VarPackage => ({
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
    scanPhase: 'analyzed',
    meta: { creator: 'Creator', packageName: 'Pkg', version: '1', dependencies: {} },
    ...overrides,
} as VarPackage);

const noop = () => {};

describe('PackageCard — rating/favourite hover control and mobile overflow entry point (phase 3 card rework)', () => {
    it('grid view: renders the mobile overflow button alongside the thumbnail', () => {
        render(
            <PackageCard
                pkg={makePkg()}
                onContextMenu={noop}
                onSelect={noop}
                onRate={noop}
                onToggleFavorite={noop}
                onOpenActionSheet={vi.fn()}
                viewMode="grid"
            />
        );
        expect(screen.getByTitle('Package actions')).toBeInTheDocument();
    });

    it('grid view: the overflow button opens the action sheet without also selecting the card', () => {
        const onOpenActionSheet = vi.fn();
        const onSelect = vi.fn();
        const pkg = makePkg();
        render(
            <PackageCard
                pkg={pkg}
                onContextMenu={noop}
                onSelect={onSelect}
                onRate={noop}
                onToggleFavorite={noop}
                onOpenActionSheet={onOpenActionSheet}
                viewMode="grid"
            />
        );
        fireEvent.click(screen.getByTitle('Package actions'));
        expect(onOpenActionSheet).toHaveBeenCalledWith(pkg);
        expect(onSelect).not.toHaveBeenCalled();
    });

    it('grid view: a never-rated, non-favourited card shows no rating/favourite badge or popover trigger', () => {
        const pkg = makePkg({ rating: 0, isFavorite: false });
        render(
            <PackageCard
                pkg={pkg}
                onContextMenu={noop}
                onSelect={noop}
                onRate={noop}
                onToggleFavorite={noop}
                onOpenActionSheet={noop}
                viewMode="grid"
            />
        );
        expect(screen.queryByTitle('Rating & favourite')).not.toBeInTheDocument();
    });

    it('grid view: clicking the badge opens a popover with the rating/favourite control, without also selecting the card', () => {
        const onSelect = vi.fn();
        const pkg = makePkg({ rating: 3, isFavorite: false });
        render(
            <PackageCard
                pkg={pkg}
                onContextMenu={noop}
                onSelect={onSelect}
                onRate={noop}
                onToggleFavorite={noop}
                onOpenActionSheet={noop}
                viewMode="grid"
            />
        );
        expect(screen.queryByTitle('Rate 4 stars')).not.toBeInTheDocument();
        fireEvent.click(screen.getByTitle('Rating & favourite'));
        expect(screen.getByTitle('Rate 4 stars')).toBeInTheDocument();
        expect(onSelect).not.toHaveBeenCalled();
    });

    it('grid view: rating from the open popover does not also select the card', () => {
        const onRate = vi.fn();
        const onSelect = vi.fn();
        const pkg = makePkg({ rating: 3, isFavorite: false });
        render(
            <PackageCard
                pkg={pkg}
                onContextMenu={noop}
                onSelect={onSelect}
                onRate={onRate}
                onToggleFavorite={noop}
                onOpenActionSheet={noop}
                viewMode="grid"
            />
        );
        fireEvent.click(screen.getByTitle('Rating & favourite'));
        fireEvent.click(screen.getByTitle('Rate 4 stars'));
        expect(onRate).toHaveBeenCalledWith(pkg, 4);
        expect(onSelect).not.toHaveBeenCalled();
    });

    it('grid view: toggling favourite from the open popover does not also select the card', () => {
        const onToggleFavorite = vi.fn();
        const onSelect = vi.fn();
        const pkg = makePkg({ rating: 0, isFavorite: true });
        render(
            <PackageCard
                pkg={pkg}
                onContextMenu={noop}
                onSelect={onSelect}
                onRate={noop}
                onToggleFavorite={onToggleFavorite}
                onOpenActionSheet={noop}
                viewMode="grid"
            />
        );
        fireEvent.click(screen.getByTitle('Rating & favourite'));
        fireEvent.click(screen.getByTitle('Remove from favourites'));
        expect(onToggleFavorite).toHaveBeenCalledWith(pkg, false);
        expect(onSelect).not.toHaveBeenCalled();
    });

    it('grid view: clicking outside the open popover closes it', async () => {
        const pkg = makePkg({ rating: 3, isFavorite: false });
        render(
            <PackageCard
                pkg={pkg}
                onContextMenu={noop}
                onSelect={noop}
                onRate={noop}
                onToggleFavorite={noop}
                onOpenActionSheet={noop}
                viewMode="grid"
            />
        );
        fireEvent.click(screen.getByTitle('Rating & favourite'));
        expect(screen.getByTitle('Rate 4 stars')).toBeInTheDocument();
        fireEvent.mouseDown(document.body);
        // The popover plays an exit animation (AnimatePresence) before unmounting.
        await waitFor(() => expect(screen.queryByTitle('Rate 4 stars')).not.toBeInTheDocument());
    });

    it('grid view: pressing Escape closes the open popover', async () => {
        const pkg = makePkg({ rating: 3, isFavorite: false });
        render(
            <PackageCard
                pkg={pkg}
                onContextMenu={noop}
                onSelect={noop}
                onRate={noop}
                onToggleFavorite={noop}
                onOpenActionSheet={noop}
                viewMode="grid"
            />
        );
        fireEvent.click(screen.getByTitle('Rating & favourite'));
        expect(screen.getByTitle('Rate 4 stars')).toBeInTheDocument();
        fireEvent.keyDown(document, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByTitle('Rate 4 stars')).not.toBeInTheDocument());
    });

    it('list view: renders the mobile overflow button next to the status icon', () => {
        render(
            <PackageCard
                pkg={makePkg()}
                onContextMenu={noop}
                onSelect={noop}
                onRate={noop}
                onToggleFavorite={noop}
                onOpenActionSheet={vi.fn()}
                viewMode="list"
            />
        );
        expect(screen.getByTitle('Package actions')).toBeInTheDocument();
    });

    it('clicking the card body (not an overlay control) still selects it', () => {
        const onSelect = vi.fn();
        const pkg = makePkg();
        render(
            <PackageCard
                pkg={pkg}
                onContextMenu={noop}
                onSelect={onSelect}
                onRate={noop}
                onToggleFavorite={noop}
                onOpenActionSheet={noop}
                viewMode="grid"
            />
        );
        fireEvent.click(screen.getByText('Pkg'));
        expect(onSelect).toHaveBeenCalledWith(pkg, expect.anything());
    });
});
