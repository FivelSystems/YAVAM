import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VarPackage } from '../../types';
import { STATUS_FILTERS } from '../../constants';
import { isPackageInContext, isStandalone, SidebarGroupMenu } from './SidebarGroupMenu';

const handleSidebarAction = vi.fn();
const handleDeleteClick = vi.fn();

vi.mock('../../context/ActionContext', () => ({
    useActionContext: () => ({ handleSidebarAction, handleDeleteClick }),
}));

const makePkg = (overrides: Partial<VarPackage> = {}): VarPackage => ({
    filePath: 'C:/lib/Creator.Pkg.1.var',
    fileName: 'Creator.Pkg.1.var',
    size: 100,
    isEnabled: true,
    isCorrupt: false,
    hasThumbnail: false,
    thumbnailPath: '',
    missingDeps: [],
    isDuplicate: false,
    isExactDuplicate: false,
    categories: [],
    scanPhase: 'analyzed',
    meta: { creator: 'Creator', packageName: 'Pkg', version: '1', dependencies: {} },
    ...overrides,
});

describe('isStandalone', () => {
    it('is true when a package declares no dependencies', () => {
        expect(isStandalone(makePkg({ meta: { creator: 'c', packageName: 'p', version: '1' } }))).toBe(true);
        expect(isStandalone(makePkg({ meta: { creator: 'c', packageName: 'p', version: '1', dependencies: {} } }))).toBe(true);
    });

    it('is false when a package declares at least one dependency', () => {
        expect(isStandalone(makePkg({ meta: { creator: 'c', packageName: 'p', version: '1', dependencies: { 'Other.Dep.1': {} } } }))).toBe(false);
    });
});

describe('isPackageInContext', () => {
    it('matches by creator', () => {
        const pkg = makePkg({ meta: { creator: 'Alice', packageName: 'p', version: '1' } });
        expect(isPackageInContext(pkg, 'creator', 'Alice')).toBe(true);
        expect(isPackageInContext(pkg, 'creator', 'Bob')).toBe(false);
    });

    it('matches by type', () => {
        const pkg = makePkg({ type: 'Clothing' });
        expect(isPackageInContext(pkg, 'type', 'Clothing')).toBe(true);
        expect(isPackageInContext(pkg, 'type', 'Scene')).toBe(false);
    });

    it('matches the "all" status bucket unconditionally', () => {
        expect(isPackageInContext(makePkg(), 'status', STATUS_FILTERS.ALL)).toBe(true);
    });

    it('matches enabled/disabled status, excluding corrupt packages', () => {
        expect(isPackageInContext(makePkg({ isEnabled: true }), 'status', STATUS_FILTERS.ENABLED)).toBe(true);
        expect(isPackageInContext(makePkg({ isEnabled: true, isCorrupt: true }), 'status', STATUS_FILTERS.ENABLED)).toBe(false);
        expect(isPackageInContext(makePkg({ isEnabled: false }), 'status', STATUS_FILTERS.DISABLED)).toBe(true);
    });

    it('matches the corrupt status bucket', () => {
        expect(isPackageInContext(makePkg({ isCorrupt: true }), 'status', STATUS_FILTERS.CORRUPT)).toBe(true);
        expect(isPackageInContext(makePkg({ isCorrupt: false }), 'status', STATUS_FILTERS.CORRUPT)).toBe(false);
    });

    it('matches the standalone status bucket via isStandalone, excluding corrupt packages', () => {
        const standalonePkg = makePkg({ meta: { creator: 'c', packageName: 'p', version: '1' } });
        expect(isPackageInContext(standalonePkg, 'status', STATUS_FILTERS.STANDALONE)).toBe(true);
        expect(isPackageInContext({ ...standalonePkg, isCorrupt: true }, 'status', STATUS_FILTERS.STANDALONE)).toBe(false);
    });

    it('returns false for an unknown group type', () => {
        expect(isPackageInContext(makePkg(), 'status', 'not-a-real-bucket')).toBe(false);
    });
});

describe('SidebarGroupMenu dividers (fix: no divider next to an empty section)', () => {
    const separatorCount = () => screen.queryAllByRole('separator').length;

    it('renders no leading divider when the group has neither enabled nor disabled packages and no cleanup', () => {
        render(
            <SidebarGroupMenu
                anchor={{ x: 0, y: 0 }}
                groupType="status"
                groupKey={STATUS_FILTERS.ALL}
                packages={[]}
                onClose={vi.fn()}
            />,
        );
        expect(screen.getByRole('menuitem', { name: /Install All to Library/i })).toBeInTheDocument();
        expect(separatorCount()).toBe(0);
    });

    it('renders exactly one divider when there is an enable/disable section but no cleanup', () => {
        // A disabled package in the "Disabled" status bucket offers "Enable All"; no
        // conflicts and a status grouping (not creator/type) means no cleanup section.
        render(
            <SidebarGroupMenu
                anchor={{ x: 0, y: 0 }}
                groupType="status"
                groupKey={STATUS_FILTERS.DISABLED}
                packages={[makePkg({ isEnabled: false })]}
                onClose={vi.fn()}
            />,
        );
        expect(screen.getByRole('menuitem', { name: /Enable All/i })).toBeInTheDocument();
        expect(screen.queryByRole('menuitem', { name: /Package Cleanup/i })).toBeNull();
        expect(separatorCount()).toBe(1);
    });

    it('renders two dividers when both the enable/disable and cleanup sections are present', () => {
        // Creator/type groupings always show cleanup, regardless of conflicts.
        render(
            <SidebarGroupMenu
                anchor={{ x: 0, y: 0 }}
                groupType="creator"
                groupKey="Creator"
                packages={[makePkg({ isEnabled: false, meta: { creator: 'Creator', packageName: 'p', version: '1' } })]}
                onClose={vi.fn()}
            />,
        );
        expect(screen.getByRole('menuitem', { name: /Enable All/i })).toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: /Package Cleanup/i })).toBeInTheDocument();
        expect(separatorCount()).toBe(2);
    });

    it('shows Delete All Corrupt only for the Corrupt status bucket, with its own divider', () => {
        const corrupt = makePkg({ isCorrupt: true });
        render(
            <SidebarGroupMenu
                anchor={{ x: 0, y: 0 }}
                groupType="status"
                groupKey={STATUS_FILTERS.CORRUPT}
                packages={[corrupt]}
                onClose={vi.fn()}
            />,
        );
        expect(screen.getByRole('menuitem', { name: /Delete \(1\)/i })).toBeInTheDocument();
    });
});
