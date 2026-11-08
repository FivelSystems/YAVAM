import { useState, useMemo, useCallback, useRef } from 'react';
import { VarPackage } from '../types';
import { parseSearchQuery, buildMatcher } from '../utils/search';
import {
    EMPTY_SLOT_VIEW, IDLE_SLOTS, ScanSlots, SlotLedger, SlotView,
    computeLedgerView, computeLiveView, dependsOnIdentifiedContent, openLedger,
} from '../utils/slotLedger';

export const useFilters = (packages: VarPackage[], scanSlots: ScanSlots = IDLE_SLOTS) => {
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

    const ledgerRef = useRef<SlotLedger | null>(null);

    const slotView = useMemo((): SlotView => {
        if (scanSlots.phase === 'held') {
            ledgerRef.current = null;
            return EMPTY_SLOT_VIEW;
        }

        // Tokenised search: creator:, type:, tag:, status:, size:, +/- operators.
        // A bare word falls back to a name/creator substring.
        const query = searchQuery.trim() ? parseSearchQuery(searchQuery) : null;
        const matches = query ? buildMatcher(query) : null;

        if (scanSlots.phase !== 'placed') {
            ledgerRef.current = null;
            return computeLiveView({ packages, matches, sortMode });
        }

        if (ledgerRef.current?.epoch !== scanSlots.epoch) {
            ledgerRef.current = openLedger(scanSlots.epoch, packages);
        }
        return computeLedgerView({
            packages, matches, sortMode,
            ledger: ledgerRef.current,
            query: searchQuery,
            contentDependent: dependsOnIdentifiedContent(query),
        });
    }, [packages, searchQuery, sortMode, scanSlots]);

    const clearFilters = useCallback(() => setSearchQuery(""), []);

    return {
        searchQuery, setSearchQuery, inputRef,
        sortMode, setSortMode,
        isSortDropdownOpen, setIsSortDropdownOpen,
        handleSortChange,
        filteredPkgs: slotView.packages,
        pendingCount: slotView.pendingCount,
        clearFilters
    };
};
