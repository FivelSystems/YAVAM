import React, { createContext, useContext } from 'react';
import { useFilters } from '../hooks/useFilters';
import { usePackageContext } from './PackageContext';
import { VarPackage } from '../types';
import { useKeybindSubscription } from './KeybindContext';

interface FilterContextType {
    searchQuery: string;
    setSearchQuery: (s: string) => void;
    inputRef: React.RefObject<HTMLInputElement>;
    sortMode: string;
    setSortMode: (s: string) => void;
    filteredPkgs: VarPackage[]; // The RESULT of filtering
    clearFilters: () => void;
    handleSortChange: (m: string) => void;
    isSortDropdownOpen: boolean;
    setIsSortDropdownOpen: (v: boolean) => void;
    currentPage: number;
    setCurrentPage: (p: number) => void;
    itemsPerPage: number;
    setItemsPerPage: (v: number) => void;
}

const FilterContext = createContext<FilterContextType | undefined>(undefined);

export const FilterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { packages } = usePackageContext();
    const filterLogic = useFilters(packages);

    // Pagination State (Added to FilterContext)
    const [currentPage, setCurrentPage] = React.useState(1);
    const [itemsPerPage, setItemsPerPage] = React.useState(() => parseInt(localStorage.getItem("itemsPerPage") || "50"));

    const handleSetItemsPerPage = (val: number) => {
        setItemsPerPage(val);
        localStorage.setItem("itemsPerPage", val.toString());
        setCurrentPage(1); // Reset page on size change
    };

    // Reset page when filters change
    React.useEffect(() => {
        setCurrentPage(1);
    }, [filterLogic.searchQuery]);

    // Notify the backend Hard Pass about the current page so it gets priority.
    const { prioritizePackages } = usePackageContext();
    React.useEffect(() => {
        if (filterLogic.filteredPkgs.length === 0) return;
        const start = (currentPage - 1) * itemsPerPage;
        const pagePaths = filterLogic.filteredPkgs
            .slice(start, start + itemsPerPage)
            .map(p => p.filePath);
        if (pagePaths.length > 0) {
            prioritizePackages(pagePaths);
        }
    }, [currentPage, itemsPerPage, filterLogic.filteredPkgs, prioritizePackages]);


    // Keybind: Focus Search
    useKeybindSubscription('focus_search', (e) => {
        e.preventDefault();
        // We need a ref to the input, but we don't have it here. 
        // We dispatch an event or use a global ID?
        // The SearchInput component listens to this? 
        // Actually FilterToolbar should handle this?
        // Ah, FilterContext logic just exposes state. 
        // Let's assume FilterToolbar handles the focus via effect or similar.
        // Wait, if this callback does nothing useful or relies on external side effects...
        // The implementation here:
        const el = document.getElementById('search-input');
        if (el) el.focus();
    }, []);

    return (
        <FilterContext.Provider value={{
            ...filterLogic,
            currentPage, setCurrentPage,
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
