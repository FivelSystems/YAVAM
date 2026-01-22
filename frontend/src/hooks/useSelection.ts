import { useState, useCallback } from 'react';
import { VarPackage } from '../types';

export const useSelection = (filteredPkgs: VarPackage[], itemsPerPage: number, setCurrentPage: (page: number) => void, currentPage: number) => {
    // Selection State
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [selectedPackage, setSelectedPackage] = useState<VarPackage | null>(null);
    const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ open: boolean, x: number, y: number, pkg: VarPackage | null }>({ open: false, x: 0, y: 0, pkg: null });

    // Handle Click (Shift/Ctrl Logic)
    const handlePackageClick = useCallback((pkg: VarPackage, e?: React.MouseEvent) => {
        if (e && (e.ctrlKey || e.metaKey)) {
            // Multi-select toggle
            setSelectedIds(prev => {
                const newSet = new Set(prev);
                if (newSet.has(pkg.filePath)) newSet.delete(pkg.filePath);
                else newSet.add(pkg.filePath);
                return newSet;
            });
            // Update anchor
            setSelectedPackage(pkg);
            setIsDetailsPanelOpen(true);
        } else if (e && e.shiftKey && selectedPackage) {
            // Shift select (range)
            const start = filteredPkgs.findIndex(p => p.filePath === selectedPackage.filePath);
            const end = filteredPkgs.findIndex(p => p.filePath === pkg.filePath);
            if (start !== -1 && end !== -1) {
                const min = Math.min(start, end);
                const max = Math.max(start, end);
                const range = filteredPkgs.slice(min, max + 1).map(p => p.filePath);
                setSelectedIds(prev => {
                    const newSet = new Set(prev);
                    range.forEach(id => newSet.add(id));
                    return newSet;
                });
            }
            setSelectedPackage(pkg);
            setIsDetailsPanelOpen(true);
        } else {
            // Single select
            if (selectedPackage?.filePath === pkg.filePath && selectedIds.size === 1) {
                // Toggle off / Deselect
                setSelectedPackage(null);
                setSelectedIds(new Set());
                setIsDetailsPanelOpen(false);
            } else {
                setSelectedPackage(pkg);
                setSelectedIds(new Set([pkg.filePath]));
                setIsDetailsPanelOpen(true);
            }
        }
    }, [filteredPkgs, selectedPackage, selectedIds, currentPage, itemsPerPage]);

    // Handle Context Menu
    const handleContextMenu = useCallback((e: React.MouseEvent, pkg: VarPackage) => {
        e.preventDefault();
        // If pkg is NOT in selectedIds, select it (exclusive)
        if (!selectedIds.has(pkg.filePath)) {
            setSelectedPackage(pkg);
            setSelectedIds(new Set([pkg.filePath]));
        }
        setContextMenu({
            open: true,
            x: e.clientX,
            y: e.clientY,
            pkg: pkg
        });
    }, [selectedIds]);

    // Navigation Logic Helper
    const navigate = useCallback((direction: -1 | 1, add: boolean) => {
        if (!selectedPackage) return;

        const currentIndex = filteredPkgs.findIndex(p => p.filePath === selectedPackage.filePath);
        if (currentIndex === -1) return;

        const newIndex = currentIndex + direction;
        if (newIndex < 0 || newIndex >= filteredPkgs.length) return;

        const newPkg = filteredPkgs[newIndex];
        setSelectedPackage(newPkg);

        // Auto-switch page if needed
        const newPage = Math.floor(newIndex / itemsPerPage) + 1;
        if (newPage !== currentPage) {
            setCurrentPage(newPage);
        }

        if (add) {
            setSelectedIds(prev => {
                const newSet = new Set(prev);
                newSet.add(newPkg.filePath);
                return newSet;
            });
        } else {
            setSelectedIds(new Set([newPkg.filePath]));
        }

        if (!isDetailsPanelOpen) setIsDetailsPanelOpen(true);
    }, [filteredPkgs, selectedPackage, itemsPerPage, currentPage, isDetailsPanelOpen]);

    const selectAllPage = useCallback(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const pagePkgs = filteredPkgs.slice(startIndex, endIndex);
        const pageIds = new Set(pagePkgs.map(p => p.filePath));
        setSelectedIds(pageIds);
        return pageIds.size;
    }, [currentPage, itemsPerPage, filteredPkgs]);

    const clearSelection = useCallback(() => {
        setSelectedIds(new Set());
        setSelectedPackage(null);
        setIsDetailsPanelOpen(false);
        setContextMenu({ open: false, x: 0, y: 0, pkg: null });
    }, []);

    return {
        selectedIds, setSelectedIds,
        selectedPackage, setSelectedPackage,
        isDetailsPanelOpen, setIsDetailsPanelOpen,
        contextMenu, setContextMenu,
        handlePackageClick,
        handleContextMenu,
        navigate,
        selectAllPage,
        clearSelection
    };
};
