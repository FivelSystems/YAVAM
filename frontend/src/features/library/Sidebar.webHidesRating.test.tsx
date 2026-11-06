import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Sidebar from './Sidebar';

// Regression coverage for #56: the sidebar's Rating section and "Only
// favourites" toggle used to be hidden on the web client because there was no
// server-side persistence endpoint for rating/favourite. The card rework
// (phase 3) added that write path (/api/package-rating, /api/package-favorite),
// so these controls are no longer gated by window.go — this test now asserts
// they show regardless, replacing the old "hides on web" expectation.

const pkg = {
    filePath: 'C:/lib/Creator.Pkg.1.var',
    fileName: 'Creator.Pkg.1.var',
    size: 100,
    isEnabled: true,
    isCorrupt: false,
    isRemovable: true,
    meta: { creator: 'Creator', packageName: 'Pkg', version: '1', dependencies: {} },
};

vi.mock('../../context/PackageContext', () => ({
    usePackageContext: () => ({ packages: [pkg], creatorStatus: {}, typeStatus: {} }),
}));
vi.mock('../../context/FilterContext', () => ({
    useFilterContext: () => ({ searchQuery: '', setSearchQuery: vi.fn(), filteredPkgs: [pkg] }),
}));
vi.mock('../../context/LibraryContext', () => ({
    useLibraryContext: () => ({
        libraries: ['C:/lib'], activeLibIndex: 0, selectLibrary: vi.fn(),
        removeLibrary: vi.fn(), reorderLibraries: vi.fn(), browseAndAdd: vi.fn(),
    }),
}));
vi.mock('../../context/ActionContext', () => ({
    useActionContext: () => ({ handleSidebarAction: vi.fn(), handleDeleteClick: vi.fn() }),
}));

describe('Sidebar rating/favourite controls (#56 — now backed by the web write path too)', () => {
    it('shows the Rating section and "Only favourites" toggle on the web client (no window.go)', () => {
        // @ts-ignore
        delete window.go;
        render(<Sidebar onOpenSettings={() => {}} />);

        expect(screen.getByText('Rating')).toBeInTheDocument();
        expect(screen.getByText('Only favourites')).toBeInTheDocument();

        // Standalone/Removable live inside the Status dropdown — unrelated to this gate.
        fireEvent.click(screen.getByText('Status'));
        const inPopover = (el: HTMLElement) => el.closest('[class*="fixed z-50"]') !== null;
        expect(screen.getAllByText(/Standalone/).some(inPopover)).toBe(true);
        expect(screen.getAllByText(/Removable/).some(inPopover)).toBe(true);
    });

    it('shows the Rating section and "Only favourites" toggle on desktop (window.go present)', () => {
        // @ts-ignore
        window.go = { main: { App: { GetLibraryCounts: vi.fn().mockResolvedValue({}) } } };
        render(<Sidebar onOpenSettings={() => {}} />);

        expect(screen.getByText('Rating')).toBeInTheDocument();
        expect(screen.getByText('Only favourites')).toBeInTheDocument();
        // @ts-ignore
        delete window.go;
    });
});
