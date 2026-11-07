import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import Sidebar from './Sidebar';

// Regression coverage for #58: "Only favourites" must use the shared Toggle
// component (a switch), not a bespoke colour-only button. Standalone/Removable
// moved into the Status FilterDropdown per docs/design/sidebar-layout.md, so
// this no longer compares Favourites against adjacent rows — it checks the
// switch shape on its own terms.

const pkg = {
    filePath: 'C:/lib/Creator.Pkg.1.var',
    fileName: 'Creator.Pkg.1.var',
    size: 100,
    isEnabled: true,
    isCorrupt: false,
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

describe('Sidebar "Only favourites" control (#58 — shared Toggle, not a bespoke button)', () => {
    beforeEach(() => {
        // @ts-ignore
        window.go = { main: { App: { GetLibraryCounts: vi.fn().mockResolvedValue({}) } } };
    });

    it('renders "Only favourites" as a switch', () => {
        render(<Sidebar onOpenSettings={() => {}} />);
        const favouritesLabel = screen.getByText('Only favourites');
        // The shared Toggle renders the switch as a sibling button, not the label itself being clickable.
        const row = favouritesLabel.closest('[class*="justify-between"]');
        expect(row?.querySelector('button[class*="rounded-full"]')).toBeTruthy();
    });
});
