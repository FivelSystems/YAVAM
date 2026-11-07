import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFilters } from './useFilters';
import { VarPackage } from '../types';

const buildPackage = (overrides: Partial<VarPackage>): VarPackage => ({
    filePath: 'C:/lib/AddonPackages/Creator.Look.1.var',
    fileName: 'Creator.Look.1.var',
    isEnabled: true,
    isCorrupt: false,
    size: 1,
    meta: { creator: 'Creator', packageName: 'Look', version: '1' },
    ...overrides,
} as VarPackage);

describe('useFilters status filter', () => {
    it('shows a package under status:disabled right after its isEnabled flag is flipped', () => {
        const enabled = buildPackage({});
        const { result, rerender } = renderHook(({ packages }) => useFilters(packages), {
            initialProps: { packages: [enabled] },
        });

        act(() => result.current.setSearchQuery('status:disabled'));
        expect(result.current.filteredPkgs).toHaveLength(0);

        const disabled = { ...enabled, isEnabled: false, filePath: `${enabled.filePath}.disabled` };
        rerender({ packages: [disabled] });

        expect(result.current.filteredPkgs.map(p => p.filePath)).toEqual([disabled.filePath]);
    });

    it('drops a package from status:enabled right after it is disabled', () => {
        const enabled = buildPackage({});
        const { result, rerender } = renderHook(({ packages }) => useFilters(packages), {
            initialProps: { packages: [enabled] },
        });

        act(() => result.current.setSearchQuery('status:enabled'));
        expect(result.current.filteredPkgs).toHaveLength(1);

        rerender({ packages: [{ ...enabled, isEnabled: false, filePath: `${enabled.filePath}.disabled` }] });
        expect(result.current.filteredPkgs).toHaveLength(0);
    });
});
