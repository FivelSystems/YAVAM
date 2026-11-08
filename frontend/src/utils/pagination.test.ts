import { describe, it, expect } from 'vitest';
import {
    INITIAL_PAGE_INTENT, PageIntent, PageView, clampPage, pageContaining, pageIntentReducer, pageOf, resolvePageIntent,
} from './pagination';
import { VarPackage } from '../types';

const ITEMS_PER_PAGE = 2;
const LIBRARY = 'C:/libs/main';
const OTHER_LIBRARY = 'C:/libs/main/nested';

const pkg = (name: string): VarPackage => ({ filePath: `${LIBRARY}/${name}.var`, fileName: `${name}.var` } as VarPackage);

const view = (overrides: Partial<PageView> = {}): PageView => {
    const list = [pkg('a'), pkg('b'), pkg('c'), pkg('d'), pkg('e')];
    return {
        renderedList: list,
        loadedPackages: list,
        loadedLibraryPath: LIBRARY,
        itemsPerPage: ITEMS_PER_PAGE,
        isGridHeld: false,
        isScanActive: false,
        hasSearch: false,
        ...overrides,
    };
};

const locate = (name: string, libraryPath = LIBRARY): PageIntent =>
    ({ kind: 'locate', filePath: `${LIBRARY}/${name}.var`, libraryPath });

describe('pageContaining', () => {
    const list = [pkg('a'), pkg('b'), pkg('c'), pkg('d'), pkg('e')];

    it('returns the 1-based page that holds the package', () => {
        expect(pageContaining(list, `${LIBRARY}/a.var`, ITEMS_PER_PAGE)).toBe(1);
        expect(pageContaining(list, `${LIBRARY}/c.var`, ITEMS_PER_PAGE)).toBe(2);
        expect(pageContaining(list, `${LIBRARY}/e.var`, ITEMS_PER_PAGE)).toBe(3);
    });

    it('matches regardless of separator and case', () => {
        expect(pageContaining(list, 'c:\\LIBS\\main\\D.VAR', ITEMS_PER_PAGE)).toBe(2);
    });

    it('returns null for a package that is not in the rendered list', () => {
        expect(pageContaining(list, `${LIBRARY}/missing.var`, ITEMS_PER_PAGE)).toBeNull();
    });

    it('computes the page over the given list, so a shorter ledger view shifts it', () => {
        const withoutPending = list.filter(p => !p.filePath.endsWith('b.var'));
        expect(pageContaining(withoutPending, `${LIBRARY}/d.var`, ITEMS_PER_PAGE)).toBe(2);
        expect(pageContaining(withoutPending, `${LIBRARY}/b.var`, ITEMS_PER_PAGE)).toBeNull();
    });
});

describe('pageIntentReducer', () => {
    it('goToPage replaces any intent with a plain page', () => {
        expect(pageIntentReducer(locate('c'), { type: 'goToPage', page: 4 })).toEqual({ kind: 'page', page: 4 });
    });

    it('locate replaces a page intent', () => {
        expect(pageIntentReducer({ kind: 'page', page: 3 }, { type: 'locate', filePath: 'f', libraryPath: LIBRARY }))
            .toEqual({ kind: 'locate', filePath: 'f', libraryPath: LIBRARY });
    });

    it('libraryChanged resets a page intent to the first page', () => {
        expect(pageIntentReducer({ kind: 'page', page: 3 }, { type: 'libraryChanged', libraryPath: LIBRARY }))
            .toEqual(INITIAL_PAGE_INTENT);
    });

    it('libraryChanged keeps a locate that targets that library, ignoring separators and case', () => {
        const pending = locate('c', 'C:\\Libs\\Main');
        expect(pageIntentReducer(pending, { type: 'libraryChanged', libraryPath: LIBRARY })).toBe(pending);
    });

    it('libraryChanged discards a locate that targets another library', () => {
        expect(pageIntentReducer(locate('c', OTHER_LIBRARY), { type: 'libraryChanged', libraryPath: LIBRARY }))
            .toEqual(INITIAL_PAGE_INTENT);
    });

    it('searchChanged resets a page intent but keeps a locate for the active library', () => {
        expect(pageIntentReducer({ kind: 'page', page: 3 }, { type: 'searchChanged', libraryPath: LIBRARY }))
            .toEqual(INITIAL_PAGE_INTENT);
        const pending = locate('c');
        expect(pageIntentReducer(pending, { type: 'searchChanged', libraryPath: LIBRARY })).toBe(pending);
    });

    it('searchChanged discards a locate for a library that is not active', () => {
        expect(pageIntentReducer(locate('c', OTHER_LIBRARY), { type: 'searchChanged', libraryPath: LIBRARY }))
            .toEqual(INITIAL_PAGE_INTENT);
    });
});

describe('resolvePageIntent', () => {
    it('clamps a plain page against the rendered list', () => {
        expect(resolvePageIntent({ kind: 'page', page: 9 }, view())).toEqual({ status: 'page', page: 3 });
        expect(clampPage(9, 5, ITEMS_PER_PAGE)).toBe(3);
    });

    it('resolves a locate to the page of the rendered list', () => {
        expect(resolvePageIntent(locate('e'), view())).toEqual({ status: 'located', page: 3 });
    });

    it('waits while the grid is held, instead of clamping against an empty list', () => {
        const held = view({ isGridHeld: true, renderedList: [], isScanActive: true });
        expect(resolvePageIntent(locate('e'), held)).toEqual({ status: 'waiting' });
    });

    it('waits while the loaded list belongs to another library, even if it holds the same path', () => {
        const previousLibraryList = view({ loadedLibraryPath: OTHER_LIBRARY, isScanActive: true });
        expect(resolvePageIntent(locate('c', LIBRARY), previousLibraryList)).toEqual({ status: 'waiting' });
    });

    it('waits for a pending package while the scan runs, and reports it missing once the scan is over', () => {
        const pendingInLedger = view({ renderedList: [pkg('a')], isScanActive: true });
        expect(resolvePageIntent(locate('e'), pendingInLedger)).toEqual({ status: 'waiting' });
        expect(resolvePageIntent(locate('e'), { ...pendingInLedger, isScanActive: false })).toEqual({ status: 'missing' });
    });

    it('reports a package the search hides, so the search can be cleared', () => {
        const filtered = view({ renderedList: [pkg('a')], hasSearch: true });
        expect(resolvePageIntent(locate('e'), filtered)).toEqual({ status: 'hidden-by-search' });
    });

    it('reports a package that is not in the library as missing', () => {
        expect(resolvePageIntent(locate('zzz'), view({ hasSearch: true }))).toEqual({ status: 'missing' });
    });

    it('is idempotent for the same inputs', () => {
        const intent = locate('d');
        expect(resolvePageIntent(intent, view())).toEqual(resolvePageIntent(intent, view()));
    });
});

describe('pageOf', () => {
    it('shows the first page for unresolved intents', () => {
        expect(pageOf({ status: 'waiting' })).toBe(1);
        expect(pageOf({ status: 'missing' })).toBe(1);
        expect(pageOf({ status: 'hidden-by-search' })).toBe(1);
        expect(pageOf({ status: 'located', page: 4 })).toBe(4);
    });
});
