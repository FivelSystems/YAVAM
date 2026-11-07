import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import Sidebar from './Sidebar';
import { stubMemoryLocalStorage } from '../../test/memoryStorage';

const LIBRARIES = ['/library/one'];

vi.mock('../../context/PackageContext', () => ({
    usePackageContext: () => ({ packages: [], creatorStatus: {}, typeStatus: {} }),
}));
vi.mock('../../context/FilterContext', () => ({
    useFilterContext: () => ({ searchQuery: '', setSearchQuery: vi.fn() }),
}));
vi.mock('../../context/LibraryContext', () => ({
    useLibraryContext: () => ({
        libraries: LIBRARIES,
        activeLibIndex: 0,
        selectLibrary: vi.fn(),
        removeLibrary: vi.fn(),
        reorderLibraries: vi.fn(),
        browseAndAdd: vi.fn(),
    }),
}));
vi.mock('../../context/ActionContext', () => ({
    useActionContext: () => ({ handleSidebarAction: vi.fn(), handleDeleteClick: vi.fn() }),
}));

describe('Sidebar library counts (web mode)', () => {
    let store: Map<string, string>;
    const fetchMock = vi.fn();

    beforeEach(() => {
        store = stubMemoryLocalStorage();
        fetchMock.mockReset();
        fetchMock.mockResolvedValue({ ok: true, json: async () => ({ [LIBRARIES[0]]: 3 }) });
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('sends the stored session token with the counts request', async () => {
        store.set('yavam_auth_token', 'stored-token');

        render(<Sidebar onOpenSettings={() => { }} />);

        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('/api/library/counts');
        expect(init.headers.Authorization).toBe('Bearer stored-token');
    });
});
