import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePackages } from './usePackages';
import { useFilters } from './useFilters';
import { VarPackage } from '../types';

const LIBRARY = 'C:/lib';
const EVENT_BATCH_MS = 200;

type Handler = (payload?: unknown) => void;

const handlers = new Map<string, Handler>();
let cachedRows: VarPackage[] = [];

const buildPackage = (name: string, overrides: Partial<VarPackage> = {}): VarPackage => ({
    filePath: `${LIBRARY}/AddonPackages/${name}.1.var`,
    fileName: `${name}.1.var`,
    isEnabled: true,
    isCorrupt: false,
    size: 1,
    creationDate: '2024-01-01T00:00:00Z',
    meta: { creator: 'Creator', packageName: name, version: '1' },
    categories: [],
    tags: [],
    ...overrides,
} as VarPackage);

const useGrid = () => {
    const packageLogic = usePackages(LIBRARY);
    const filters = useFilters(packageLogic.packages, packageLogic.scanSlots);
    return { packageLogic, filters };
};

const emit = (event: string, payload?: unknown) => act(() => { handlers.get(event)?.(payload); });
const advanceBatch = () => act(() => { vi.advanceTimersByTime(EVENT_BATCH_MS + 1); });
const discoveryStage = (current: number, total: number, done = false) =>
    emit('scan:stage', { stage: 'discovery', current, total, done });

const startScan = async (result: { current: ReturnType<typeof useGrid> }) => {
    await act(async () => { void result.current.packageLogic.scanPackages(); });
    await act(async () => { await Promise.resolve(); });
};

const names = (result: { current: ReturnType<typeof useGrid> }) =>
    result.current.filters.filteredPkgs.map(p => p.meta.packageName);

beforeEach(() => {
    vi.useFakeTimers();
    handlers.clear();
    cachedRows = [];
    localStorage.setItem('sortMode', 'name-asc');
    const runtime = window.runtime as unknown as Record<string, unknown>;
    runtime.EventsOn = (event: string, handler: Handler) => { handlers.set(event, handler); };
    runtime.EventsOff = (event: string) => { handlers.delete(event); };
    (window as unknown as { go: unknown }).go = {
        main: {
            App: {
                GetCachedPackages: vi.fn(async () => cachedRows),
                ScanPackages: vi.fn(() => new Promise(() => undefined)),
                CancelScan: vi.fn(async () => undefined),
                SetCurrentPage: vi.fn(async () => undefined),
            },
        },
    };
});

afterEach(() => {
    vi.useRealTimers();
    delete (window as unknown as { go?: unknown }).go;
});

describe('cold scan', () => {
    it('shows no partial grid until enumeration is complete, then the full ordered set at once', async () => {
        const { result } = renderHook(useGrid);
        await startScan(result);

        discoveryStage(0, 4);
        emit('package:discovered', buildPackage('Delta'));
        emit('package:discovered', buildPackage('Alpha'));
        advanceBatch();
        emit('package:discovered', buildPackage('Charlie'));
        advanceBatch();
        expect(result.current.packageLogic.scanSlots.phase).toBe('held');
        expect(names(result)).toEqual([]);

        emit('package:discovered', buildPackage('Bravo'));

        expect(result.current.packageLogic.scanSlots.phase).toBe('placed');
        expect(names(result)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
        expect(result.current.filters.filteredPkgs.every(p => p.scanPhase === 'discovered')).toBe(true);
    });

    it('places the same slots whatever order the events arrive in', async () => {
        const arrivals = [
            ['Delta', 'Alpha', 'Charlie', 'Bravo'],
            ['Bravo', 'Charlie', 'Delta', 'Alpha'],
            ['Alpha', 'Bravo', 'Charlie', 'Delta'],
        ];
        for (const arrival of arrivals) {
            const { result, unmount } = renderHook(useGrid);
            await startScan(result);
            discoveryStage(0, arrival.length);
            arrival.forEach(name => emit('package:discovered', buildPackage(name)));
            advanceBatch();
            expect(names(result)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
            unmount();
        }
    });

    it('releases an empty library once the enumeration stage reports done', async () => {
        const { result } = renderHook(useGrid);
        await startScan(result);

        discoveryStage(0, 0, true);

        expect(result.current.packageLogic.scanSlots.phase).toBe('placed');
    });

    it('does not move any placed card when identification and analysis events arrive shuffled', async () => {
        localStorage.setItem('sortMode', 'size-asc');
        const { result } = renderHook(useGrid);
        await startScan(result);
        const discovered = [
            buildPackage('Alpha', { size: 10 }),
            buildPackage('Bravo', { size: 20 }),
            buildPackage('Charlie', { size: 30 }),
        ];
        discoveryStage(0, 3);
        [...discovered].reverse().forEach(p => emit('package:discovered', p));
        const placedOrder = names(result);
        expect(placedOrder).toEqual(['Alpha', 'Bravo', 'Charlie']);

        const reversedSizes = [
            { ...discovered[2], size: 1, categories: ['Clothing'] },
            { ...discovered[0], size: 999, categories: ['Hair'] },
            { ...discovered[1], size: 500, categories: ['Looks'] },
        ];
        reversedSizes.forEach(p => {
            emit('package:scanned', p);
            expect(names(result)).toEqual(placedOrder);
        });
        advanceBatch();
        expect(names(result)).toEqual(placedOrder);

        emit('scan:analysis:complete', discovered.map(p => ({
            filePath: p.filePath, missingDeps: ['X.Y.1'], isDuplicate: true, isExactDuplicate: false, isRemovable: false,
        })));
        expect(names(result)).toEqual(placedOrder);
    });

    it('leaves a consistent, sorted grid when the scan is cancelled while held', async () => {
        const { result } = renderHook(useGrid);
        await startScan(result);
        discoveryStage(0, 3);
        emit('package:discovered', buildPackage('Charlie'));
        emit('package:discovered', buildPackage('Alpha'));
        advanceBatch();
        expect(names(result)).toEqual([]);

        await act(async () => { await result.current.packageLogic.cancelScan(); });
        advanceBatch();

        expect(result.current.packageLogic.scanSlots.phase).toBe('idle');
        expect(names(result)).toEqual(['Alpha', 'Charlie']);
    });
});

describe('cache-painted library', () => {
    it('renders final immediately and is not held', async () => {
        cachedRows = [buildPackage('Bravo'), buildPackage('Alpha')];
        const { result } = renderHook(useGrid);
        await startScan(result);

        expect(result.current.packageLogic.scanSlots.phase).toBe('placed');
        expect(names(result)).toEqual(['Alpha', 'Bravo']);
        expect(result.current.filters.filteredPkgs.every(p => p.scanPhase === 'analyzed')).toBe(true);
    });

    it('keeps a newly discovered file out of the grid until the scan completes', async () => {
        cachedRows = [buildPackage('Bravo'), buildPackage('Delta')];
        const { result } = renderHook(useGrid);
        await startScan(result);

        discoveryStage(0, 3);
        emit('package:discovered', buildPackage('Charlie'));
        emit('package:discovered', buildPackage('Bravo'));
        emit('package:discovered', buildPackage('Delta'));
        advanceBatch();

        expect(names(result)).toEqual(['Bravo', 'Delta']);
        expect(result.current.filters.pendingCount).toBe(1);

        emit('scan:complete');

        expect(names(result)).toEqual(['Bravo', 'Charlie', 'Delta']);
        expect(result.current.filters.pendingCount).toBe(0);
    });

    it('applies deletions live and drops the file at completion', async () => {
        cachedRows = [buildPackage('Alpha'), buildPackage('Bravo')];
        const { result } = renderHook(useGrid);
        await startScan(result);

        emit('package:discovered', buildPackage('Alpha'));
        emit('scan:complete');

        expect(names(result)).toEqual(['Alpha']);
    });
});

describe('content-dependent filters during a scan', () => {
    const typeQuery = 'type:clothing';

    it('does not add, drop or reshuffle visible cards until the scan completes', async () => {
        cachedRows = [
            buildPackage('Alpha', { categories: ['Clothing'] }),
            buildPackage('Bravo', { categories: ['Hair'] }),
            buildPackage('Charlie', { categories: ['Clothing'] }),
        ];
        const { result } = renderHook(useGrid);
        await startScan(result);
        act(() => result.current.filters.setSearchQuery(typeQuery));
        const visibleBefore = names(result);
        expect(visibleBefore).toEqual(['Alpha', 'Charlie']);

        discoveryStage(0, 4);
        cachedRows.forEach(p => emit('package:discovered', p));
        emit('package:discovered', buildPackage('Delta'));
        emit('package:scanned', buildPackage('Alpha', { categories: ['Hair'] }));
        emit('package:scanned', buildPackage('Bravo', { categories: ['Clothing'] }));
        emit('package:scanned', buildPackage('Delta', { categories: ['Clothing'] }));
        advanceBatch();

        expect(names(result)).toEqual(visibleBefore);
        expect(result.current.filters.pendingCount).toBe(2);

        emit('scan:complete');

        expect(names(result)).toEqual(['Bravo', 'Charlie', 'Delta']);
        expect(result.current.filters.pendingCount).toBe(0);
    });
});
