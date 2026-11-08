import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import CardGrid from './CardGrid';
import PackageSkeleton from './components/PackageSkeleton';
import { getCardState, isPendingCardState } from './utils';
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
    meta: { creator: 'Creator', packageName: 'Pkg', version: '3', dependencies: {} },
    ...overrides,
} as VarPackage);

const noop = () => {};

describe('getCardState', () => {
    it('is reserved when the slot has no row', () => {
        expect(getCardState(undefined)).toBe('reserved');
    });

    it('maps each scan phase to its card state', () => {
        expect(getCardState(makePkg({ scanPhase: 'discovered' }))).toBe('listed');
        expect(getCardState(makePkg({ scanPhase: 'scanned' }))).toBe('identified');
        expect(getCardState(makePkg({ scanPhase: 'analyzed' }))).toBe('settled');
    });

    it('is failed for corrupt packages whatever the phase', () => {
        expect(getCardState(makePkg({ isCorrupt: true, scanPhase: 'discovered' }))).toBe('failed');
        expect(getCardState(makePkg({ isCorrupt: true, scanPhase: 'analyzed' }))).toBe('failed');
    });

    it('treats only reserved and listed as pending', () => {
        expect(isPendingCardState('reserved')).toBe(true);
        expect(isPendingCardState('listed')).toBe(true);
        expect(isPendingCardState('identified')).toBe(false);
        expect(isPendingCardState('settled')).toBe(false);
        expect(isPendingCardState('failed')).toBe(false);
    });
});

describe('PackageSkeleton', () => {
    it('renders a reserved slot as an empty aria-hidden shell', () => {
        const { container } = render(<PackageSkeleton />);
        expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
        expect(container.textContent).toBe('');
    });

    it('shows name, creator and version for a listed package', () => {
        const { container } = render(<PackageSkeleton pkg={makePkg({ scanPhase: 'discovered' })} />);
        expect(container.firstElementChild).not.toHaveAttribute('aria-hidden');
        expect(container.textContent).toContain('Pkg');
        expect(container.textContent).toContain('Creator');
        expect(container.textContent).toContain('v3');
    });

    it('keeps the name masked when names are hidden', () => {
        const { getByText } = render(
            <PackageSkeleton pkg={makePkg({ scanPhase: 'discovered' })} hidePackageNames hideCreatorNames />
        );
        expect(getByText('Pkg')).toHaveClass('opacity-0');
        expect(getByText('Creator')).toHaveClass('opacity-0');
    });

    it('applies the shimmer class only when shimmering', () => {
        const pkg = makePkg({ scanPhase: 'discovered' });
        expect(render(<PackageSkeleton pkg={pkg} />).container.querySelector('.scan-shimmer')).toBeNull();
        expect(render(<PackageSkeleton pkg={pkg} shimmering />).container.querySelector('.scan-shimmer')).not.toBeNull();
    });
});

describe('CardGrid without decorative animation', () => {
    const renderGrid = (packages: VarPackage[], isScanActive = false) =>
        render(
            <CardGrid
                packages={packages}
                totalCount={packages.length}
                onContextMenu={noop}
                onSelect={noop}
                onRate={noop}
                onToggleFavorite={noop}
                onOpenActionSheet={noop}
                viewMode="grid"
                isScanActive={isScanActive}
            />
        );

    it('mounts cache-known cards in their final state with no inline fade styles', () => {
        const { container } = renderGrid([makePkg(), makePkg({ filePath: 'C:/lib/B.1.var', fileName: 'B.1.var' })]);
        const cards = container.querySelectorAll('[id^="package-"]');
        expect(cards).toHaveLength(2);
        cards.forEach(card => {
            expect(card.getAttribute('style') ?? '').not.toMatch(/opacity|transform/);
        });
        const wrappers = container.querySelectorAll('[id^="pkg-"]');
        wrappers.forEach(wrapper => {
            expect(wrapper.getAttribute('style') ?? '').not.toMatch(/opacity|transform/);
        });
    });

    it('does not shimmer settled cards even while a scan is active', () => {
        const { container } = renderGrid([makePkg()], true);
        expect(container.querySelector('.scan-shimmer')).toBeNull();
    });

    it('shimmers listed cards while a scan is active and not otherwise', () => {
        const listed = makePkg({ scanPhase: 'discovered' });
        expect(renderGrid([listed], true).container.querySelector('.scan-shimmer')).not.toBeNull();
        expect(renderGrid([listed], false).container.querySelector('.scan-shimmer')).toBeNull();
    });
});
