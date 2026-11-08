import React, { createContext, useContext } from 'react';
import { useFilters } from '../hooks/useFilters';
import { usePackageContext } from './PackageContext';
import { useLibraryContext } from './LibraryContext';
import { useToasts } from './ToastContext';
import { VarPackage } from '../types';
import { useKeybindSubscription } from './KeybindContext';
import {
    FIRST_PAGE, INITIAL_PAGE_INTENT, PageView, pageIntentReducer, pageOf, resolvePageIntent,
} from '../utils/pagination';
import { isSamePath } from '../utils/normalizePath';

const DEFAULT_ITEMS_PER_PAGE = 50;

export interface ResolvedLocate {
    filePath: string;
    /** Changes on every resolution so locating the same package twice highlights it twice. */
    timestamp: number;
}

interface FilterContextType {
    searchQuery: string;
    setSearchQuery: (s: string) => void;
    inputRef: React.RefObject<HTMLInputElement>;
    sortMode: string;
    setSortMode: (s: string) => void;
    filteredPkgs: VarPackage[]; // The RESULT of filtering
    /** Matching packages held back until the running scan completes. */
    pendingCount: number;
    clearFilters: () => void;
    handleSortChange: (m: string) => void;
    isSortDropdownOpen: boolean;
    setIsSortDropdownOpen: (v: boolean) => void;
    currentPage: number;
    goToPage: (page: number) => void;
    /**
     * Shows the page that holds `filePath` once the view of `libraryPath` is ready.
     * Dispatch it before switching to that library; a manual library change discards it.
     */
    locatePackage: (filePath: string, libraryPath: string) => void;
    /** Set when a locate lands on its page, so the grid can highlight the package. */
    resolvedLocate: ResolvedLocate | null;
    itemsPerPage: number;
    setItemsPerPage: (v: number) => void;
}

const FilterContext = createContext<FilterContextType | undefined>(undefined);

export const FilterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { packages, loadedLibraryPath, loading: isScanActive, scanSlots, prioritizePackages } = usePackageContext();
    const { activeLibraryPath } = useLibraryContext();
    const { addToast } = useToasts();
    const filterLogic = useFilters(packages, scanSlots);
    const { searchQuery, setSearchQuery, filteredPkgs } = filterLogic;

    const [pageIntent, dispatchPageIntent] = React.useReducer(pageIntentReducer, INITIAL_PAGE_INTENT);
    const [itemsPerPage, setItemsPerPage] = React.useState(() =>
        parseInt(localStorage.getItem("itemsPerPage") || String(DEFAULT_ITEMS_PER_PAGE)));
    const [resolvedLocate, setResolvedLocate] = React.useState<ResolvedLocate | null>(null);

    const latestRef = React.useRef({ pageIntent, addToast });
    latestRef.current = { pageIntent, addToast };

    const isGridHeld = scanSlots.phase === 'held';
    const pageView: PageView = {
        renderedList: filteredPkgs,
        loadedPackages: packages,
        loadedLibraryPath,
        itemsPerPage,
        isGridHeld,
        isScanActive,
        hasSearch: searchQuery.trim().length > 0,
    };
    const resolution = resolvePageIntent(pageIntent, pageView);
    const currentPage = pageOf(resolution);

    const goToPage = React.useCallback((page: number) => dispatchPageIntent({ type: 'goToPage', page }), []);
    const locatePackage = React.useCallback((filePath: string, libraryPath: string) =>
        dispatchPageIntent({ type: 'locate', filePath, libraryPath }), []);

    const handleSetItemsPerPage = (val: number) => {
        setItemsPerPage(val);
        localStorage.setItem("itemsPerPage", val.toString());
        goToPage(FIRST_PAGE);
    };

    React.useEffect(() => {
        const { pageIntent: intent, addToast: notify } = latestRef.current;
        if (intent.kind === 'locate' && !isSamePath(intent.libraryPath, activeLibraryPath)) {
            notify("Locate cancelled: the library changed before the package loaded.", "info");
        }
        dispatchPageIntent({ type: 'libraryChanged', libraryPath: activeLibraryPath });
    }, [activeLibraryPath]);

    React.useEffect(() => {
        dispatchPageIntent({ type: 'searchChanged', libraryPath: activeLibraryPath });
    }, [searchQuery]);

    const isClampWritable = !isGridHeld && isSamePath(loadedLibraryPath, activeLibraryPath);
    const resolvedPage = pageOf(resolution);
    React.useEffect(() => {
        const { pageIntent: intent, addToast: notify } = latestRef.current;
        switch (resolution.status) {
            case 'located':
                if (intent.kind !== 'locate') return;
                setResolvedLocate({ filePath: intent.filePath, timestamp: Date.now() });
                goToPage(resolution.page);
                return;
            case 'hidden-by-search':
                setSearchQuery("");
                return;
            case 'missing':
                notify("Package not found in its library.", "warning");
                goToPage(FIRST_PAGE);
                return;
            case 'page':
                if (intent.kind === 'page' && isClampWritable && intent.page !== resolution.page) goToPage(resolution.page);
                return;
            case 'waiting':
                return;
        }
    }, [resolution.status, resolvedPage, pageIntent, isClampWritable, goToPage, setSearchQuery]);

    const lastSentPageRef = React.useRef('');
    React.useEffect(() => {
        if (filteredPkgs.length === 0) return;
        const start = (currentPage - 1) * itemsPerPage;
        const pagePaths = filteredPkgs
            .slice(start, start + itemsPerPage)
            .map(p => p.filePath);
        if (pagePaths.length === 0) return;
        const pageSignature = `${scanSlots.epoch}\n${pagePaths.join('\n')}`;
        if (pageSignature === lastSentPageRef.current) return;
        lastSentPageRef.current = pageSignature;
        prioritizePackages(pagePaths);
    }, [currentPage, itemsPerPage, filteredPkgs, scanSlots.epoch, prioritizePackages]);

    useKeybindSubscription('focus_search', (e) => {
        e.preventDefault();
        document.getElementById('search-input')?.focus();
    }, []);

    return (
        <FilterContext.Provider value={{
            ...filterLogic,
            currentPage, goToPage, locatePackage, resolvedLocate,
            itemsPerPage, setItemsPerPage: handleSetItemsPerPage
        }}>
            {children}
        </FilterContext.Provider>
    );
};

export const useFilterContext = () => {
    const context = useContext(FilterContext);
    if (!context) throw new Error("useFilterContext must be used within FilterProvider");
    return context;
};
