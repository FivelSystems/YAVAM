import { useState, useMemo, useCallback, useRef } from 'react';
import { VarPackage } from '../types';

export const useFilters = (packages: VarPackage[]) => {
    // Search State
    const [searchQuery, setSearchQuery] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    const [tagSearchQuery, setTagSearchQuery] = useState("");
    const [isTagSearchOpen, setIsTagSearchOpen] = useState(false);

    // Filtering State
    const [currentFilter, setCurrentFilter] = useState("all");
    const [selectedCreator, setSelectedCreator] = useState<string | null>(null);
    const [selectedType, setSelectedType] = useState<string | null>(null);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);

    // Sort State
    const [sortMode, setSortMode] = useState<string>(localStorage.getItem("sortMode") || 'name-asc');
    const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);

    // Toggle Sort Helper
    const handleSortChange = (mode: string) => {
        setSortMode(mode);
        localStorage.setItem("sortMode", mode);
        setIsSortDropdownOpen(false);
    };

    // Derived Logic: Filters & Sort
    const filteredPkgs = useMemo(() => {
        let res = [...packages];

        // 1. Status Filter
        if (currentFilter === "enabled") res = res.filter(p => p.isEnabled && !p.isCorrupt);
        if (currentFilter === "disabled") res = res.filter(p => !p.isEnabled && !p.isCorrupt);
        if (currentFilter === "missing-deps") res = res.filter(p => p.missingDeps && p.missingDeps.length > 0 && !p.isCorrupt);
        // "version-conflicts" -> isDuplicate
        if (currentFilter === "version-conflicts") res = res.filter(p => p.isDuplicate && !p.isCorrupt);
        if (currentFilter === "duplicates") res = res.filter(p => p.isDuplicate && !p.isCorrupt);
        if (currentFilter === "exact-duplicates") res = res.filter(p => p.isExactDuplicate && !p.isCorrupt);
        if (currentFilter === "corrupt") res = res.filter(p => p.isCorrupt);
        if (currentFilter === "unreferenced") res = res.filter(p => p.isOrphan && !p.isCorrupt);

        // 2. Creator Filter
        if (selectedCreator) {
            res = res.filter(p => p.meta?.creator === selectedCreator);
        }

        // 3. Type Filter
        if (selectedType) {
            res = res.filter(p => {
                if (p.categories && p.categories.length > 0) {
                    return p.categories.includes(selectedType);
                }
                return p.type === selectedType;
            });
        }

        // 4. Tags Filter (AND logic)
        if (selectedTags.length > 0) {
            res = res.filter(p => {
                const pTags = p.tags || [];
                return selectedTags.every(t => pTags.includes(t));
            });
        }

        // 5. Search Query
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            res = res.filter(p => {
                const name = p.fileName?.toLowerCase() || "";
                const pkgName = p.meta?.packageName?.toLowerCase() || "";
                const creator = p.meta?.creator?.toLowerCase() || "";
                return name.includes(q) || creator.includes(q) || pkgName.includes(q);
            });
        }

        // 6. Sorting
        res.sort((a, b) => {
            switch (sortMode) {
                case 'name-asc':
                    return (a.fileName || "").localeCompare(b.fileName || "");
                case 'name-desc':
                    return (b.fileName || "").localeCompare(a.fileName || "");
                case 'size-asc':
                    return a.size - b.size;
                case 'size-desc':
                    return b.size - a.size;
                case 'date-newest':
                    // @ts-ignore
                    return new Date(b.creationDate || 0).getTime() - new Date(a.creationDate || 0).getTime();
                case 'date-oldest':
                    // @ts-ignore
                    return new Date(a.creationDate || 0).getTime() - new Date(b.creationDate || 0).getTime();
                default:
                    return 0;
            }
        });

        return res;
    }, [packages, currentFilter, selectedCreator, selectedType, selectedTags, searchQuery, sortMode]);

    // Helpers
    const clearFilters = useCallback(() => {
        setSearchQuery("");
        setCurrentFilter("all");
        setSelectedCreator(null);
        setSelectedType(null);
        setSelectedTags([]);
    }, []);

    return {
        searchQuery, setSearchQuery, inputRef,
        tagSearchQuery, setTagSearchQuery,
        isTagSearchOpen, setIsTagSearchOpen,
        currentFilter, setCurrentFilter,
        selectedCreator, setSelectedCreator,
        selectedType, setSelectedType,
        selectedTags, setSelectedTags,
        sortMode, setSortMode,
        isSortDropdownOpen, setIsSortDropdownOpen,
        handleSortChange,
        filteredPkgs,
        clearFilters
    };
};
