import { VarPackage } from '../types';
import { isSamePath } from './normalizePath';

export const FIRST_PAGE = 1;

/** Returns the last valid page for the given item count; an empty set still has page 1. */
export const lastPage = (totalItems: number, itemsPerPage: number): number =>
    Math.max(FIRST_PAGE, Math.ceil(totalItems / Math.max(1, itemsPerPage)));

export const clampPage = (page: number, totalItems: number, itemsPerPage: number): number =>
    Math.min(Math.max(FIRST_PAGE, page), lastPage(totalItems, itemsPerPage));

/** The page of `list` (the list the grid renders) that holds `filePath`, or null when it is not in the list. */
export const pageContaining = (list: VarPackage[], filePath: string, itemsPerPage: number): number | null => {
    const index = list.findIndex(pkg => isSamePath(pkg.filePath, filePath));
    if (index === -1) return null;
    return Math.floor(index / Math.max(1, itemsPerPage)) + FIRST_PAGE;
};

export type PageIntent =
    | { kind: 'page'; page: number }
    | { kind: 'locate'; filePath: string; libraryPath: string };

export type PageIntentAction =
    | { type: 'goToPage'; page: number }
    | { type: 'locate'; filePath: string; libraryPath: string }
    | { type: 'libraryChanged'; libraryPath: string }
    | { type: 'searchChanged'; libraryPath: string };

export const INITIAL_PAGE_INTENT: PageIntent = { kind: 'page', page: FIRST_PAGE };

const keepsLocate = (intent: PageIntent, activeLibraryPath: string): boolean =>
    intent.kind === 'locate' && isSamePath(intent.libraryPath, activeLibraryPath);

/** A pending locate that targets the active library survives a reset; any other reset goes to the first page. */
export const pageIntentReducer = (intent: PageIntent, action: PageIntentAction): PageIntent => {
    switch (action.type) {
        case 'goToPage':
            return { kind: 'page', page: action.page };
        case 'locate':
            return { kind: 'locate', filePath: action.filePath, libraryPath: action.libraryPath };
        case 'libraryChanged':
        case 'searchChanged':
            return keepsLocate(intent, action.libraryPath) ? intent : INITIAL_PAGE_INTENT;
    }
};

/** Everything a page intent needs to know about what the grid is showing. */
export interface PageView {
    /** The list the grid renders (ledger view included). */
    renderedList: VarPackage[];
    /** Every package loaded for `loadedLibraryPath`, including ones the grid does not list. */
    loadedPackages: VarPackage[];
    loadedLibraryPath: string;
    itemsPerPage: number;
    isGridHeld: boolean;
    isScanActive: boolean;
    hasSearch: boolean;
}

export type PageResolution =
    | { status: 'page'; page: number }
    | { status: 'located'; page: number }
    /** The target library or its list is not ready; nothing may be written yet. */
    | { status: 'waiting' }
    /** The package is loaded but the active search hides it. */
    | { status: 'hidden-by-search' }
    /** The package is not in the target library and no scan is going to bring it. */
    | { status: 'missing' };

const isViewSettledFor = (libraryPath: string, view: PageView): boolean =>
    !view.isGridHeld && isSamePath(view.loadedLibraryPath, libraryPath);

const resolveLocate = (filePath: string, libraryPath: string, view: PageView): PageResolution => {
    if (!isViewSettledFor(libraryPath, view)) return { status: 'waiting' };

    const page = pageContaining(view.renderedList, filePath, view.itemsPerPage);
    if (page !== null) return { status: 'located', page };

    const isLoaded = view.loadedPackages.some(pkg => isSamePath(pkg.filePath, filePath));
    if (isLoaded && view.hasSearch) return { status: 'hidden-by-search' };
    return view.isScanActive ? { status: 'waiting' } : { status: 'missing' };
};

/** Turns the intent into what to show: a pending locate beats everything, a plain page is clamped. */
export const resolvePageIntent = (intent: PageIntent, view: PageView): PageResolution => {
    if (intent.kind === 'locate') return resolveLocate(intent.filePath, intent.libraryPath, view);
    return { status: 'page', page: clampPage(intent.page, view.renderedList.length, view.itemsPerPage) };
};

/** The page to render for a resolution; unresolved intents show the first page without writing it back. */
export const pageOf = (resolution: PageResolution): number =>
    resolution.status === 'page' || resolution.status === 'located' ? resolution.page : FIRST_PAGE;
