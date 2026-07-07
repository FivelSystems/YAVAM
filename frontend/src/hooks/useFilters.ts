import { useState, useMemo, useCallback, useRef } from 'react';
import { VarPackage } from '../types';
import { parseSearchQuery, buildMatcher } from '../utils/search';

export const useFilters = (packages: VarPackage[]) => {
    // The tokenised query is the single source of truth for filtering. The
    // sidebar composes it (status:/creator:/type: tokens) exactly like the
    // searchbar chips do, so there is no parallel filter state to keep in sync.
    const [searchQuery, setSearchQuery] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    // Sort State
    const [sortMode, setSortMode] = useState<string>(localStorage.getItem("sortMode") || 'name-asc');
    const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);

    const handleSortChange = (mode: string) => {
        setSortMode(mode);
        localStorage.setItem("sortMode", mode);
        setIsSortDropdownOpen(false);
    };

    const filteredPkgs = useMemo(() => {
        let res = [...packages];

        // Tokenised search: creator:, type:, tag:, status:, size:, +/- operators.
        // A bare word falls back to a name/creator substring.
        if (searchQuery.trim()) {
            const matches = buildMatcher(parseSearchQuery(searchQuery));
            res = res.filter(matches);
        }

        res.sort((a, b) => {
            let cmp = 0;
            switch (sortMode) {
                case 'name-asc':
                    cmp = (a.fileName || "").localeCompare(b.fileName || "");
                    break;
                case 'name-desc':
                    cmp = (b.fileName || "").localeCompare(a.fileName || "");
                    break;
                case 'size-asc':
                    cmp = a.size - b.size;
                    break;
                case 'size-desc':
                    cmp = b.size - a.size;
                    break;
                case 'date-newest':
                    // @ts-ignore
                    cmp = new Date(b.creationDate || 0).getTime() - new Date(a.creationDate || 0).getTime();
                    break;
                case 'date-oldest':
                    // @ts-ignore
                    cmp = new Date(a.creationDate || 0).getTime() - new Date(b.creationDate || 0).getTime();
                    break;
                default:
                    cmp = 0;
            }
            // Deterministic Tie-Breaker: filePath is unique
            if (cmp === 0) {
                return a.filePath.localeCompare(b.filePath);
            }
            return cmp;
        });

        return res;
    }, [packages, searchQuery, sortMode]);

    const clearFilters = useCallback(() => setSearchQuery(""), []);

    return {
        searchQuery, setSearchQuery, inputRef,
        sortMode, setSortMode,
        isSortDropdownOpen, setIsSortDropdownOpen,
        handleSortChange,
        filteredPkgs,
        clearFilters
    };
};
