import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Sidebar from './Sidebar';

// Regression coverage for #53 (status filter not reflecting a toggle without a
// rescan) and its actual confirmed root cause: a status facet that just emptied
// out (e.g. the last enabled package was disabled) used to vanish from the
// dropdown's option list while still being the active filter, leaving the user
// stuck looking at an empty grid with no visible control in the list to switch
// or clear it.
//
// Mocks the surrounding contexts directly (same lightweight pattern as
// SearchBar.test.tsx) rather than mounting the real provider stack + a scan —
// keeps this test fast and focused purely on Sidebar's own rendering logic.

const makePkg = (overrides: any = {}) => ({
    filePath: 'C:/lib/Creator.Pkg.1.var',
    fileName: 'Creator.Pkg.1.var',
    size: 100,
    isEnabled: true,
    isCorrupt: false,
    meta: { creator: 'Creator', packageName: 'Pkg', version: '1', dependencies: {} },
    ...overrides,
});

// Mutable, test-controlled state fed to the mocked contexts. Mutate it, then
// call RTL's `rerender` to make Sidebar pick up the change — simulating what
// the real PackageProvider/FilterProvider would propagate on a toggle/filter
// change, without mounting their scan machinery.
let testPackages: any[] = [];
let testSearchQuery = '';
const setSearchQuery = vi.fn((q: string) => { testSearchQuery = q; });

vi.mock('../../context/PackageContext', () => ({
    usePackageContext: () => ({ packages: testPackages, creatorStatus: {}, typeStatus: {} }),
}));
vi.mock('../../context/FilterContext', () => ({
    useFilterContext: () => ({ searchQuery: testSearchQuery, setSearchQuery, filteredPkgs: testPackages }),
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

describe('Sidebar status filter reactivity (#53)', () => {
    beforeEach(() => {
        // @ts-ignore
        window.go = { main: { App: { GetLibraryCounts: vi.fn().mockResolvedValue({}) } } };
        testPackages = [makePkg()];
        testSearchQuery = 'status:enabled'; // the reviewer already narrowed to Enabled
        setSearchQuery.mockClear();
    });

    it('keeps the now-empty "Enabled" facet visible in the dropdown after the only enabled package is disabled', () => {
        const { rerender } = render(<Sidebar onOpenSettings={() => {}} />);

        fireEvent.click(screen.getByText(/Enabled/)); // opens the Status dropdown (trigger shows the active facet)
        expect(screen.getAllByText(/^Enabled$/).some(el => el.closest('[class*="fixed z-50"]'))).toBe(true);

        // Simulate the optimistic toggle: the package in state is now disabled —
        // exactly what usePackageActions.togglePackage does without a rescan.
        testPackages = [makePkg({ isEnabled: false, filePath: 'C:/lib/Creator.Pkg.1.var.disabled' })];
        rerender(<Sidebar onOpenSettings={() => {}} />);

        // The "Enabled" bucket is now at count 0 but status:enabled is STILL the
        // active filter — it must stay visible and clickable, not vanish and
        // strand the user on an invisible, un-removable dead filter.
        const enabledOption = screen.getAllByText(/^Enabled$/)
            .map(el => el.closest('button'))
            .find((btn): btn is HTMLButtonElement => !!btn && btn.closest('[class*="fixed z-50"]') !== null);
        expect(enabledOption).toBeTruthy();
        expect(enabledOption).toHaveTextContent('0'); // its count badge reflects the toggle immediately

        // Clicking it removes the (now orphaned) status:enabled constraint.
        fireEvent.click(enabledOption!);
        expect(setSearchQuery).toHaveBeenCalledWith('');

        // And the now-disabled package is immediately reachable under "Disabled"
        // from this same packages array — no rescan involved anywhere in this flow.
        testSearchQuery = '';
        rerender(<Sidebar onOpenSettings={() => {}} />);
        const disabledOption = screen.getAllByText(/^Disabled$/)
            .map(el => el.closest('button'))
            .find((btn): btn is HTMLButtonElement => !!btn && btn.closest('[class*="fixed z-50"]') !== null);
        expect(disabledOption).toBeTruthy();
        fireEvent.click(disabledOption!);
        expect(setSearchQuery).toHaveBeenCalledWith('status:disabled');
    });
});
