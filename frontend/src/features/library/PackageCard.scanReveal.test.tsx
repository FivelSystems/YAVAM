import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
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
const REVEAL_SELECTOR = '.scan-reveal';

const renderCard = (pkg: VarPackage, isScanActive: boolean) => {
    const card = (current: VarPackage, scanActive: boolean) => (
        <PackageCard
            pkg={current}
            onContextMenu={noop}
            onSelect={noop}
            onRate={noop}
            onToggleFavorite={noop}
            onOpenActionSheet={noop}
            viewMode="grid"
            isScanActive={scanActive}
        />
    );
    const view = render(card(pkg, isScanActive));
    return {
        container: view.container,
        update: (next: VarPackage, scanActive = isScanActive) => view.rerender(card(next, scanActive)),
    };
};

describe('PackageCard scan reveal', () => {
    it('reveals a card that was listed during an active scan once it is identified', () => {
        const { container, update } = renderCard(makePkg({ scanPhase: 'discovered' }), true);
        expect(container.querySelector(REVEAL_SELECTOR)).toBeNull();

        update(makePkg({ scanPhase: 'scanned' }));

        expect(container.querySelector(REVEAL_SELECTOR)).not.toBeNull();
    });

    it('does not replay a reveal for later state changes of the same card', () => {
        const { container, update } = renderCard(makePkg({ scanPhase: 'discovered' }), true);
        update(makePkg({ scanPhase: 'scanned' }));
        const revealed = container.querySelector(REVEAL_SELECTOR);

        update(makePkg({ scanPhase: 'analyzed' }));

        expect(container.querySelector(REVEAL_SELECTOR)).toBe(revealed);
    });

    it('never reveals a card that mounts with its data already known', () => {
        const { container, update } = renderCard(makePkg({ scanPhase: 'analyzed' }), true);
        expect(container.querySelector(REVEAL_SELECTOR)).toBeNull();

        update(makePkg({ scanPhase: 'analyzed', isDuplicate: true }));

        expect(container.querySelector(REVEAL_SELECTOR)).toBeNull();
    });

    it('never reveals a card mounted identified by a page change during a scan', () => {
        const { container } = renderCard(makePkg({ scanPhase: 'scanned', hasThumbnail: true, thumbnailBase64: 'AAAA' }), true);

        expect(container.querySelector(REVEAL_SELECTOR)).toBeNull();
    });

    it('does not reveal a listed card that changes while no scan is active', () => {
        const { container, update } = renderCard(makePkg({ scanPhase: 'discovered' }), false);

        update(makePkg({ scanPhase: 'analyzed' }));

        expect(container.querySelector(REVEAL_SELECTOR)).toBeNull();
    });

    it('reveals the thumbnail image of a revealed card', () => {
        const { container, update } = renderCard(makePkg({ scanPhase: 'discovered' }), true);

        update(makePkg({ scanPhase: 'scanned', hasThumbnail: true, thumbnailBase64: 'AAAA' }));

        expect(container.querySelector(`img${REVEAL_SELECTOR}`)).not.toBeNull();
    });
});
