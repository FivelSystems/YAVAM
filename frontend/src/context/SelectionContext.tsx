import React, { createContext, useContext } from 'react';
import { useSelection } from '../hooks/useSelection';
import { useFilterContext } from './FilterContext';
import { VarPackage } from '../types';
import { useKeybindSubscription } from './KeybindContext';

interface SelectionContextType {
    selectedIds: Set<string>;
    setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
    selectedPackage: VarPackage | null;
    setSelectedPackage: (p: VarPackage | null) => void;
    isDetailsPanelOpen: boolean;
    setIsDetailsPanelOpen: (v: boolean) => void;
    contextMenu: { open: boolean; x: number; y: number; pkg: VarPackage | null };
    setContextMenu: (v: any) => void;
    handlePackageClick: (pkg: VarPackage, e?: React.MouseEvent) => void;
    handleContextMenu: (e: React.MouseEvent, pkg: VarPackage) => void;
    navigate: (direction: -1 | 1, add: boolean) => void;
    selectAllPage: () => number;
    clearSelection: () => void;
}

const SelectionContext = createContext<SelectionContextType | undefined>(undefined);

export const SelectionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { filteredPkgs, itemsPerPage, setCurrentPage, currentPage } = useFilterContext();
    const selectionLogic = useSelection(filteredPkgs, itemsPerPage, setCurrentPage, currentPage);

    // Keybinds

    useKeybindSubscription('select_all', (e) => {
        e.preventDefault();
        selectionLogic.selectAllPage();
    }, [selectionLogic]);

    useKeybindSubscription('clear_selection', (e) => {
        // Only if not in input
        if (selectionLogic.selectedIds.size > 0) {
            selectionLogic.clearSelection();
            e.preventDefault();
        }
    }, [selectionLogic]);

    useKeybindSubscription('select_next', (e) => { e.preventDefault(); selectionLogic.navigate(1, false); }, [selectionLogic]);
    useKeybindSubscription('select_prev', (e) => { e.preventDefault(); selectionLogic.navigate(-1, false); }, [selectionLogic]);
    useKeybindSubscription('select_next_add', (e) => { e.preventDefault(); selectionLogic.navigate(1, true); }, [selectionLogic]);
    useKeybindSubscription('select_prev_add', (e) => { e.preventDefault(); selectionLogic.navigate(-1, true); }, [selectionLogic]);

    // Page Navigation via keys? 
    // Dashboard had check('prev_page') -> setCurrentPage
    useKeybindSubscription('prev_page', (e) => {
        e.preventDefault();
        if (currentPage > 1) setCurrentPage(currentPage - 1);
    }, [currentPage, setCurrentPage]);

    useKeybindSubscription('next_page', (e) => {
        e.preventDefault();
        const maxPage = Math.ceil(filteredPkgs.length / itemsPerPage);
        if (currentPage < maxPage) setCurrentPage(currentPage + 1);
    }, [currentPage, filteredPkgs.length, itemsPerPage, setCurrentPage]);

    return (
        <SelectionContext.Provider value={selectionLogic}>
            {children}
        </SelectionContext.Provider>
    );
};

export const useSelectionContext = () => {
    const context = useContext(SelectionContext);
    if (!context) throw new Error("useSelectionContext must be used within SelectionProvider");
    return context;
};
