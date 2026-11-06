import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Sidebar from './Sidebar';

// Regression coverage for #56: the sidebar's Rating section and "Only
// favourites" toggle have no server-side persistence on the web client, so
// they must be hidden there (matching the existing isWeb check in
// ContextMenu.tsx) instead of presenting dead controls.
//
// Mocks the contexts directly (SearchBar.test.tsx's pattern) rather than
// mounting the real provider stack + a scan — keeps this test fast and
// focused purely on the isWeb-gated rendering.

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

describe('Sidebar on the web client (#56 — hide rating/favourite controls with no persistence)', () => {
    it('hides the Rating section and "Only favourites" toggle when there is no window.go', () => {
        // @ts-ignore
        delete window.go;
        render(<Sidebar onOpenSettings={() => {}} />);

        expect(screen.queryByText('Rating')).not.toBeInTheDocument();
        expect(screen.queryByText('Only favourites')).not.toBeInTheDocument();

        // Standalone/Removable live inside the Status dropdown now — they aren't
        // gated by isWeb, but only exist in the DOM once the popover is open.
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
