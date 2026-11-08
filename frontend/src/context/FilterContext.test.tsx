import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { FilterProvider, useFilterContext } from './FilterContext';
import { clampPage } from '../utils/pagination';

const ITEMS_PER_PAGE = 2;

let mockPackages: unknown[] = [];

vi.mock('./PackageContext', () => ({
    usePackageContext: () => ({ packages: mockPackages, prioritizePackages: vi.fn() }),
}));
vi.mock('./KeybindContext', () => ({
    useKeybindSubscription: () => undefined,
}));

const makePackages = (count: number, prefix = 'Creator') =>
    Array.from({ length: count }, (_, index) => ({
        fileName: `${prefix}.Pkg${index}.1.var`,
        filePath: `/lib/${prefix}.Pkg${index}.1.var`,
        meta: { creator: prefix, packageName: `Pkg${index}` },
    }));

const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <FilterProvider>{children}</FilterProvider>
);

const renderFilterContext = (packages: unknown[]) => {
    localStorage.setItem('itemsPerPage', String(ITEMS_PER_PAGE));
    mockPackages = packages;
    return renderHook(() => useFilterContext(), { wrapper });
};

describe('clampPage', () => {
    it('keeps a valid page', () => expect(clampPage(2, 4, 2)).toBe(2));
    it('clamps to the last page', () => expect(clampPage(9, 5, 2)).toBe(3));
    it('falls back to page 1 for an empty set', () => expect(clampPage(4, 0, 2)).toBe(1));
});

describe('FilterProvider page clamping', () => {
    it('lands on a valid page when switching to a library with fewer pages', () => {
        const { result, rerender } = renderFilterContext(makePackages(10));
        act(() => result.current.setCurrentPage(5));
        expect(result.current.currentPage).toBe(5);

        mockPackages = makePackages(3, 'Other');
        rerender();

        expect(result.current.currentPage).toBe(2);
    });

    it('resets to page 1 when the library becomes empty', () => {
        const { result, rerender } = renderFilterContext(makePackages(10));
        act(() => result.current.setCurrentPage(4));

        mockPackages = [];
        rerender();

        expect(result.current.currentPage).toBe(1);
    });

    it('clamps when a filter shrinks the result set', () => {
        const mixed = [...makePackages(6, 'Alpha'), ...makePackages(2, 'Beta')];
        const { result } = renderFilterContext(mixed);
        act(() => result.current.setCurrentPage(4));
        expect(result.current.currentPage).toBe(4);

        act(() => result.current.setSearchQuery('creator:Beta'));

        expect(result.current.filteredPkgs).toHaveLength(2);
        expect(result.current.currentPage).toBe(1);
    });

    it('stays on page 1 when a search matches nothing', () => {
        const { result } = renderFilterContext(makePackages(6));
        act(() => result.current.setCurrentPage(3));

        act(() => result.current.setSearchQuery('creator:NoSuchCreator'));

        expect(result.current.filteredPkgs).toHaveLength(0);
        expect(result.current.currentPage).toBe(1);
    });
});
