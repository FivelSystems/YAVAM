import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { FilterProvider, useFilterContext } from './FilterContext';
import { clampPage } from '../utils/pagination';

const ITEMS_PER_PAGE = 2;
const LIBRARY = '/lib';
const OTHER_LIBRARY = '/other';

interface MockState {
    packages: unknown[];
    loadedLibraryPath: string;
    activeLibraryPath: string;
    loading: boolean;
    scanSlots: { phase: string; epoch: number };
}

const freshState = (): MockState => ({
    packages: [],
    loadedLibraryPath: LIBRARY,
    activeLibraryPath: LIBRARY,
    loading: false,
    scanSlots: { phase: 'idle', epoch: 0 },
});

let mock = freshState();
const prioritizeSpy = vi.fn();
const addToastSpy = vi.fn();

vi.mock('./PackageContext', () => ({
    usePackageContext: () => ({
        packages: mock.packages,
        loadedLibraryPath: mock.loadedLibraryPath,
        loading: mock.loading,
        scanSlots: mock.scanSlots,
        prioritizePackages: prioritizeSpy,
    }),
}));
vi.mock('./LibraryContext', () => ({
    useLibraryContext: () => ({ activeLibraryPath: mock.activeLibraryPath }),
}));
vi.mock('./ToastContext', () => ({
    useToasts: () => ({ addToast: addToastSpy }),
}));
vi.mock('./KeybindContext', () => ({
    useKeybindSubscription: () => undefined,
}));

beforeEach(() => {
    mock = freshState();
    addToastSpy.mockClear();
});

const makePackages = (count: number, prefix = 'Creator', directory = LIBRARY) =>
    Array.from({ length: count }, (_, index) => ({
        fileName: `${prefix}.Pkg${index}.1.var`,
        filePath: `${directory}/${prefix}.Pkg${index}.1.var`,
        meta: { creator: prefix, packageName: `Pkg${index}` },
    }));

const pathOf = (index: number, prefix = 'Creator', directory = LIBRARY) =>
    `${directory}/${prefix}.Pkg${index}.1.var`;

const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <FilterProvider>{children}</FilterProvider>
);

const renderFilterContext = (packages: unknown[]) => {
    localStorage.setItem('itemsPerPage', String(ITEMS_PER_PAGE));
    mock.packages = packages;
    return renderHook(() => useFilterContext(), { wrapper });
};

describe('clampPage', () => {
    it('keeps a valid page', () => expect(clampPage(2, 4, 2)).toBe(2));
    it('clamps to the last page', () => expect(clampPage(9, 5, 2)).toBe(3));
    it('falls back to page 1 for an empty set', () => expect(clampPage(4, 0, 2)).toBe(1));
});

describe('FilterProvider page priority', () => {
    it('sends the visible page once, and again only when the page contents change', () => {
        prioritizeSpy.mockClear();
        const { result, rerender } = renderFilterContext(makePackages(6));
        expect(prioritizeSpy).toHaveBeenCalledTimes(1);
        expect(prioritizeSpy).toHaveBeenLastCalledWith(['/lib/Creator.Pkg0.1.var', '/lib/Creator.Pkg1.1.var']);

        mock.packages = makePackages(6);
        rerender();
        expect(prioritizeSpy).toHaveBeenCalledTimes(1);

        act(() => result.current.goToPage(2));
        expect(prioritizeSpy).toHaveBeenCalledTimes(2);
        expect(prioritizeSpy).toHaveBeenLastCalledWith(['/lib/Creator.Pkg2.1.var', '/lib/Creator.Pkg3.1.var']);
    });
});

describe('FilterProvider page clamping', () => {
    it('lands on a valid page when switching to a library with fewer pages', () => {
        const { result, rerender } = renderFilterContext(makePackages(10));
        act(() => result.current.goToPage(5));
        expect(result.current.currentPage).toBe(5);

        mock.packages = makePackages(3, 'Other');
        rerender();

        expect(result.current.currentPage).toBe(2);
    });

    it('resets to page 1 when the library becomes empty', () => {
        const { result, rerender } = renderFilterContext(makePackages(10));
        act(() => result.current.goToPage(4));

        mock.packages = [];
        rerender();

        expect(result.current.currentPage).toBe(1);
    });

    it('clamps when a filter shrinks the result set', () => {
        const mixed = [...makePackages(6, 'Alpha'), ...makePackages(2, 'Beta')];
        const { result } = renderFilterContext(mixed);
        act(() => result.current.goToPage(4));
        expect(result.current.currentPage).toBe(4);

        act(() => result.current.setSearchQuery('creator:Beta'));

        expect(result.current.filteredPkgs).toHaveLength(2);
        expect(result.current.currentPage).toBe(1);
    });

    it('stays on page 1 when a search matches nothing', () => {
        const { result } = renderFilterContext(makePackages(6));
        act(() => result.current.goToPage(3));

        act(() => result.current.setSearchQuery('creator:NoSuchCreator'));

        expect(result.current.filteredPkgs).toHaveLength(0);
        expect(result.current.currentPage).toBe(1);
    });
});

describe('FilterProvider page intent', () => {
    it('lands on page 1 after a manual library switch', () => {
        const { result, rerender } = renderFilterContext(makePackages(6));
        act(() => result.current.goToPage(3));

        mock.activeLibraryPath = OTHER_LIBRARY;
        rerender();

        expect(result.current.currentPage).toBe(1);
    });

    it('resets to page 1 when the user types in search', () => {
        const { result } = renderFilterContext(makePackages(6));
        act(() => result.current.goToPage(3));

        act(() => result.current.setSearchQuery('Pkg'));

        expect(result.current.currentPage).toBe(1);
    });

    it('locates a visible package in the same library and reports it as resolved once', () => {
        const { result } = renderFilterContext(makePackages(6));

        act(() => result.current.locatePackage(pathOf(4), LIBRARY));

        expect(result.current.currentPage).toBe(3);
        expect(result.current.resolvedLocate?.filePath).toBe(pathOf(4));
    });

    it('lands on the package page when it has to clear the search first', () => {
        const mixed = [...makePackages(6, 'Alpha'), ...makePackages(2, 'Beta')];
        const { result } = renderFilterContext(mixed);
        act(() => result.current.setSearchQuery('creator:Beta'));
        expect(result.current.filteredPkgs).toHaveLength(2);

        act(() => result.current.locatePackage(pathOf(4, 'Alpha'), LIBRARY));

        expect(result.current.searchQuery).toBe('');
        expect(result.current.currentPage).toBe(3);
        expect(result.current.resolvedLocate?.filePath).toBe(pathOf(4, 'Alpha'));
    });

    it('waits through a held grid and lands on the right page once the target library is ready', () => {
        const targetPackages = makePackages(6, 'Creator', OTHER_LIBRARY);
        const { result, rerender } = renderFilterContext(makePackages(6));

        act(() => result.current.locatePackage(pathOf(4, 'Creator', OTHER_LIBRARY), OTHER_LIBRARY));
        mock.activeLibraryPath = OTHER_LIBRARY;
        mock.loading = true;
        rerender();
        expect(result.current.resolvedLocate).toBeNull();

        mock.packages = [];
        mock.loadedLibraryPath = OTHER_LIBRARY;
        mock.scanSlots = { phase: 'held', epoch: 1 };
        rerender();
        expect(result.current.resolvedLocate).toBeNull();
        expect(result.current.currentPage).toBe(1);

        mock.packages = targetPackages;
        mock.scanSlots = { phase: 'placed', epoch: 2 };
        rerender();

        expect(result.current.currentPage).toBe(3);
        expect(result.current.resolvedLocate?.filePath).toBe(pathOf(4, 'Creator', OTHER_LIBRARY));
        expect(addToastSpy).not.toHaveBeenCalled();
    });

    it('never resolves a locate against the previous library list, even when it holds the same path', () => {
        const nestedPath = pathOf(4, 'Creator', LIBRARY);
        const { result, rerender } = renderFilterContext(makePackages(6));

        act(() => result.current.locatePackage(nestedPath, OTHER_LIBRARY));
        mock.activeLibraryPath = OTHER_LIBRARY;
        mock.loading = true;
        rerender();

        expect(result.current.resolvedLocate).toBeNull();
    });

    it('discards a pending locate on a manual library change and tells the user', () => {
        const { result, rerender } = renderFilterContext(makePackages(6));
        act(() => result.current.locatePackage(pathOf(4, 'Creator', OTHER_LIBRARY), OTHER_LIBRARY));
        mock.activeLibraryPath = OTHER_LIBRARY;
        mock.loading = true;
        rerender();

        mock.activeLibraryPath = '/third';
        rerender();

        expect(addToastSpy).toHaveBeenCalledTimes(1);
        expect(result.current.currentPage).toBe(1);

        mock.activeLibraryPath = OTHER_LIBRARY;
        mock.loadedLibraryPath = OTHER_LIBRARY;
        mock.loading = false;
        mock.packages = makePackages(6, 'Creator', OTHER_LIBRARY);
        rerender();

        expect(result.current.resolvedLocate).toBeNull();
        expect(result.current.currentPage).toBe(1);
    });

    it('goes to page 1 with a toast when the package never appears', () => {
        const { result, rerender } = renderFilterContext(makePackages(6));
        act(() => result.current.goToPage(2));
        act(() => result.current.locatePackage(pathOf(0, 'Creator', OTHER_LIBRARY), OTHER_LIBRARY));
        mock.activeLibraryPath = OTHER_LIBRARY;
        mock.loadedLibraryPath = OTHER_LIBRARY;
        mock.packages = makePackages(2, 'Creator', OTHER_LIBRARY).slice(1);
        mock.loading = true;
        rerender();
        expect(addToastSpy).not.toHaveBeenCalled();

        mock.loading = false;
        rerender();

        expect(addToastSpy).toHaveBeenCalledTimes(1);
        expect(result.current.currentPage).toBe(1);
        expect(result.current.resolvedLocate).toBeNull();

        rerender();
        expect(addToastSpy).toHaveBeenCalledTimes(1);
    });
});
