import { ChevronDown, ChevronRight, Layers, Package, Settings, CheckCircle2, Trash2, GripVertical, Download, Sparkles, Power, Star, Heart, Boxes, Users, Tags, X } from 'lucide-react';
import { VarPackage } from '../../types';
import clsx from 'clsx';
import { useMemo, useState, useEffect } from 'react';
import { Reorder, useDragControls } from "framer-motion";
import { usePackageContext } from '../../context/PackageContext';
import { useFilterContext } from '../../context/FilterContext';
import { useLibraryContext } from '../../context/LibraryContext';
import { useActionContext } from '../../context/ActionContext';
import { STATUS_FILTERS } from '../../constants';
import { hasToken, toggleToken, getRating, setRating } from '../../utils/search';
import { FilterDropdown, FilterOption } from '../../components/ui/FilterDropdown';
import { Toggle } from '../../components/ui/Toggle';


// Simple Library Item Component
const SidebarLibraryItem = ({ lib, isActive, count, onSelect, onRemove }: { lib: string, isActive: boolean, count?: number, onSelect: () => void, onRemove?: (lib: string) => void }) => {
    const controls = useDragControls();
    return (
        <Reorder.Item value={lib} dragListener={false} dragControls={controls} className="relative" layout>
            <div className={clsx("flex items-center group px-2 py-1.5 rounded hover:bg-gray-700 cursor-pointer overflow-hidden select-none border border-transparent", isActive ? "bg-blue-600/10 border-blue-600/20" : "")}>
                <div
                    onPointerDown={(e) => controls.start(e)}
                    className="mr-2 cursor-grab text-gray-500 hover:text-gray-200 active:cursor-grabbing p-0.5 rounded touch-none flex items-center justify-center shrink-0"
                >
                    <GripVertical size={14} />
                </div>

                <div className="flex-1 min-w-0" onClick={onSelect}>
                    <div className={clsx("text-sm font-medium truncate flex justify-between items-center", isActive ? "text-blue-400" : "text-gray-300")}>
                        <span className="truncate">{lib.split(/[/\\]/).pop()}</span>
                        {count !== undefined && <span className="text-[10px] bg-gray-900/50 text-gray-400 px-1.5 rounded-full ml-1">{count}</span>}
                    </div>
                    <div className="text-[10px] text-gray-600 truncate" title={lib}>{lib}</div>
                </div>

                {onRemove && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onRemove(lib); }}
                        className="p-1.5 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                        title="Remove Library"
                    >
                        <Trash2 size={14} />
                    </button>
                )}
            </div>
        </Reorder.Item>
    );
};

/**
 * An exact-rating control: clicking star N filters to packages rated exactly N;
 * clicking the active star again clears it. Emits `rating:N` into the shared
 * query, matched against each package's stored rating (user_metadata).
 */
const RatingStars = ({ value, onChange }: { value: number, onChange: (n: number) => void }) => {
    const [hover, setHover] = useState(0);
    const shown = hover || value;
    return (
        <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map(n => (
                <button
                    key={n}
                    onClick={() => onChange(n)}
                    onMouseEnter={() => setHover(n)}
                    className="p-0.5 text-gray-500 hover:text-yellow-400 transition-colors"
                    title={`Rated ${n} star${n > 1 ? 's' : ''}`}
                >
                    <Star size={18} className={clsx(n <= shown ? "fill-yellow-400 text-yellow-400" : "fill-transparent")} />
                </button>
            ))}
            {value > 0 && (
                <button onClick={() => onChange(0)} className="ml-1 text-[10px] text-gray-500 hover:text-white">clear</button>
            )}
        </div>
    );
};

type SidebarProps = {
    // UI Only Props
    onOpenSettings: () => void;
};

const Sidebar = ({ onOpenSettings }: SidebarProps) => {
    // Context Consumption
    const { packages, creatorStatus, typeStatus } = usePackageContext();
    const { searchQuery, setSearchQuery } = useFilterContext();

    // The sidebar composes the same tokenised query as the searchbar: a facet is
    // "active" when its token is present, and clicking it toggles that token.
    const statusActive = (value: string) => hasToken(searchQuery, 'status', value);
    const toggleStatus = (value: string) => setSearchQuery(toggleToken(searchQuery, 'status', value));
    const anyFilterActive = searchQuery.trim().length > 0;
    const clearAllFilters = () => setSearchQuery('');

    const rating = getRating(searchQuery);
    const changeRating = (n: number) => setSearchQuery(setRating(searchQuery, n === rating ? 0 : n));
    const favoriteActive = hasToken(searchQuery, 'favorite', 'true');
    const toggleFavorite = () => setSearchQuery(toggleToken(searchQuery, 'favorite', 'true'));

    const {
        libraries, activeLibIndex, selectLibrary,
        removeLibrary, reorderLibraries, browseAndAdd
    } = useLibraryContext();
    const { handleSidebarAction, handleDeleteClick } = useActionContext();

    // Local State
    const [isLibDropdownOpen, setIsLibDropdownOpen] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ open: boolean, x: number, y: number, groupType: 'creator' | 'type' | 'status', key: string } | null>(null);
    const [libraryCounts, setLibraryCounts] = useState<Record<string, number>>({});

    // Fetch Library Counts (Unified)
    useEffect(() => {
        if (!libraries || libraries.length === 0) return;

        const fetchCounts = async () => {
            try {
                let counts: Record<string, number> = {};
                // @ts-ignore
                if (window.go && window.go.main && window.go.main.App) {
                    // Desktop
                    // @ts-ignore
                    counts = await window.go.main.App.GetLibraryCounts(libraries);
                } else {
                    // Web
                    const res = await fetch('/api/library/counts', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`
                        },
                        body: JSON.stringify({ libraries })
                    });
                    if (res.ok) {
                        counts = await res.json();
                    }
                }
                setLibraryCounts(counts);
            } catch (e) {
                console.error("Failed to fetch library counts:", e);
            }
        };

        fetchCounts();
    }, [libraries, packages]);

    const currentLibPath = libraries && libraries[activeLibIndex] ? libraries[activeLibIndex] : "No Library Selected";
    const currentLibName = currentLibPath.split(/[/\\]/).pop() || "Library";

    const handleContextMenu = (e: React.MouseEvent, groupType: 'creator' | 'type' | 'status', key: string) => {
        e.preventDefault();
        setContextMenu({ open: true, x: e.clientX, y: e.clientY, groupType, key });
    };

    // Close context menu on global click
    useEffect(() => {
        const close = () => setContextMenu(null);
        window.addEventListener('click', close);
        return () => window.removeEventListener('click', close);
    }, []);

    // Category (type) options for the Categories dropdown.
    const typeOptions = useMemo<FilterOption[]>(() => {
        const counts: Record<string, number> = {};
        packages.forEach(p => {
            // Corrupt packages have their own Status filter; exclude them here
            // so they never pollute the category list with "Unknown".
            if (p.isCorrupt) return;
            const t = p.type || 'Other';
            counts[t] = (counts[t] || 0) + 1;
        });
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .map(([value, count]) => ({ value, label: value, count, tone: typeStatus[value] }));
    }, [packages, typeStatus]);

    const creatorOptions = useMemo<FilterOption[]>(() => {
        const counts: Record<string, number> = {};
        packages.forEach(p => {
            const c = p.meta.creator || "Unknown";
            counts[c] = (counts[c] || 0) + 1;
        });
        return Object.entries(counts)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([value, count]) => ({ value, label: value, count, tone: creatorStatus[value] }));
    }, [packages, creatorStatus]);

    const statusCounts = useMemo(() => {
        const validPkgs = packages.filter(p => !p.isCorrupt);
        const corruptPkgs = packages.filter(p => p.isCorrupt);
        const isStandalone = (p: VarPackage) => !p.meta?.dependencies || Object.keys(p.meta.dependencies).length === 0;

        return {
            all: packages.length,
            enabled: validPkgs.filter(p => p.isEnabled).length,
            disabled: validPkgs.filter(p => !p.isEnabled).length,
            missingDeps: validPkgs.filter(p => p.missingDeps && p.missingDeps.length > 0).length,
            versionConflicts: validPkgs.filter(p => p.isDuplicate).length,
            exactDuplicates: validPkgs.filter(p => p.isExactDuplicate).length,
            removable: validPkgs.filter(p => p.isRemovable).length,
            standalone: validPkgs.filter(isStandalone).length,
            corrupt: corruptPkgs.length
        };
    }, [packages]);

    // Status options, hidden when a bucket is empty (mirrors the old list).
    const statusOptions = useMemo<FilterOption[]>(() => {
        const defs: { value: string, label: string, count: number, tone?: FilterOption['tone'] }[] = [
            { value: 'enabled', label: 'Enabled', count: statusCounts.enabled },
            { value: 'disabled', label: 'Disabled', count: statusCounts.disabled },
            { value: 'missing-deps', label: 'Missing Deps', count: statusCounts.missingDeps, tone: 'error' },
            { value: 'version-conflicts', label: 'Conflicts', count: statusCounts.versionConflicts, tone: 'warning' },
            { value: 'exact-duplicates', label: 'Duplicates', count: statusCounts.exactDuplicates, tone: 'warning' },
            { value: 'corrupt', label: 'Corrupt', count: statusCounts.corrupt, tone: 'error' },
        ];
        return defs.filter(d => d.count > 0);
    }, [statusCounts]);

    return (
        <aside className="w-64 h-full bg-gray-800 border-r border-gray-700 flex flex-col shadow-xl z-20">
            {/* Header */}
            <div className="p-4 border-b border-gray-700 bg-gray-800/50">
                <div className="flex items-center gap-2 mb-2">
                    <div className="bg-blue-600 p-1.5 rounded-lg shrink-0">
                        <Package className="text-white" size={20} />
                    </div>
                    {/* Library Switcher */}
                    <div className="flex-1 flex items-center justify-between bg-gray-900/50 rounded-lg p-1 border border-gray-700/50 relative min-w-0">
                        <button
                            onClick={() => selectLibrary((activeLibIndex - 1 + libraries.length) % libraries.length)}
                            className="p-1 hover:text-white text-gray-500 transition-colors"
                            disabled={libraries.length <= 1}
                        >
                            <ChevronDown className="rotate-90" size={16} />
                        </button>

                        <div
                            className="flex-1 text-center cursor-pointer min-w-0 px-2"
                            onClick={() => setIsLibDropdownOpen(!isLibDropdownOpen)}
                        >
                            <span className="text-[10px] text-gray-500 uppercase tracking-wider block leading-none mb-0.5">Library</span>
                            <div className="font-bold text-gray-200 text-sm leading-tight select-none truncate" title={currentLibPath}>
                                {currentLibName}
                            </div>
                            {statusCounts.all > 0 && (
                                <span className="block text-[10px] text-gray-500 leading-none mt-0.5" title="Total packages in this library">
                                    {statusCounts.all.toLocaleString()} packages
                                </span>
                            )}
                        </div>

                        <button
                            onClick={() => selectLibrary((activeLibIndex + 1) % libraries.length)}
                            className="p-1 hover:text-white text-gray-500 transition-colors"
                            disabled={libraries.length <= 1}
                        >
                            <ChevronRight size={16} />
                        </button>
                        {/* Dropdown ... */}
                        {isLibDropdownOpen && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setIsLibDropdownOpen(false)}></div>
                                <div className="absolute top-full left-0 mt-2 w-72 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-20 py-2 flex flex-col max-h-[80vh] overflow-y-auto">
                                    <Reorder.Group
                                        axis="y"
                                        values={libraries}
                                        onReorder={(newOrder) => reorderLibraries && reorderLibraries(newOrder)}
                                        className="flex flex-col gap-0.5 px-1"
                                        layoutScroll
                                    >
                                        {libraries.map((lib, idx) => (
                                            <SidebarLibraryItem
                                                key={lib}
                                                lib={lib}
                                                isActive={idx === activeLibIndex}
                                                count={libraryCounts[lib]}
                                                onSelect={() => { selectLibrary(idx); setIsLibDropdownOpen(false); }}
                                                onRemove={removeLibrary}
                                            />
                                        ))}
                                    </Reorder.Group>
                                    <div className="border-t border-gray-700/50 mt-1 pt-1 px-1 pb-1">
                                        {browseAndAdd && (
                                            <button
                                                onClick={() => { browseAndAdd(); setIsLibDropdownOpen(false); }}
                                                className="w-full px-2 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-blue-400 rounded transition-colors flex items-center justify-center gap-1.5"
                                            >
                                                <Layers size={12} /> Add Library
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                    <button onClick={onOpenSettings} className="text-gray-400 hover:text-white transition-colors shrink-0 ml-1" title="Settings">
                        <Settings size={20} />
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-4">
                {/* Filter panel header. Right-click exposes the library-wide bulk
                    actions that used to hang off the old "All Packages" button. */}
                <div
                    className="flex items-center justify-between px-1 h-5"
                    onContextMenu={(e) => handleContextMenu(e, 'status', STATUS_FILTERS.ALL)}
                >
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Filters</span>
                    {anyFilterActive && (
                        <button
                            onClick={clearAllFilters}
                            className="text-[11px] text-gray-400 hover:text-white flex items-center gap-1 transition-colors"
                            title="Clear every active filter"
                        >
                            <X size={12} /> Clear all
                        </button>
                    )}
                </div>

                {/* Dropdown filters (one shared FilterDropdown, three configurations) */}
                <div className="space-y-2">
                    <FilterDropdown
                        label="Status"
                        icon={<Boxes size={16} />}
                        options={statusOptions}
                        isSelected={statusActive}
                        onToggle={toggleStatus}
                        onOptionContextMenu={(value, e) => handleContextMenu(e, 'status', value)}
                        emptyHint="No status buckets"
                    />
                    <FilterDropdown
                        label="Creators"
                        icon={<Users size={16} />}
                        options={creatorOptions}
                        isSelected={(v) => hasToken(searchQuery, 'creator', v)}
                        onToggle={(v) => setSearchQuery(toggleToken(searchQuery, 'creator', v))}
                        searchable
                        searchPlaceholder="Filter creators…"
                        onOptionContextMenu={(value, e) => handleContextMenu(e, 'creator', value)}
                    />
                    <FilterDropdown
                        label="Categories"
                        icon={<Tags size={16} />}
                        options={typeOptions}
                        isSelected={(v) => hasToken(searchQuery, 'type', v)}
                        onToggle={(v) => setSearchQuery(toggleToken(searchQuery, 'type', v))}
                        searchable
                        searchPlaceholder="Filter categories…"
                        onOptionContextMenu={(value, e) => handleContextMenu(e, 'type', value)}
                    />
                </div>

                {/* Rating */}
                <div className="px-1">
                    <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Rating</span>
                        {rating > 0 && <span className="text-[10px] text-gray-500">{rating} star{rating > 1 ? 's' : ''}</span>}
                    </div>
                    <RatingStars value={rating} onChange={changeRating} />
                </div>

                {/* Favourites + dependency-relationship toggles */}
                <div className="space-y-3 border-t border-gray-700/50 pt-4 px-1">
                    <button
                        onClick={toggleFavorite}
                        className={clsx(
                            "w-full flex items-center gap-2 text-sm transition-colors",
                            favoriteActive ? "text-pink-400" : "text-gray-400 hover:text-white"
                        )}
                    >
                        <Heart size={16} className={clsx(favoriteActive && "fill-pink-400")} />
                        <span className="font-medium">Only favourites</span>
                    </button>

                    <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Dependency relationship</p>
                        <div className="space-y-2.5">
                            <div title="Self-contained: declares no dependencies of its own.">
                                <Toggle
                                    size="sm"
                                    checked={statusActive('standalone')}
                                    onChange={() => toggleStatus('standalone')}
                                    label={`Standalone (${statusCounts.standalone})`}
                                />
                            </div>
                            <div title="No other package depends on these, so removing them won't break anything.">
                                <Toggle
                                    size="sm"
                                    checked={statusActive('removable')}
                                    onChange={() => toggleStatus('removable')}
                                    label={`Removable (${statusCounts.removable})`}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Context Menu (Using handleSidebarAction from Context) */}
            {contextMenu && (() => {
                const isPackageInContext = (p: VarPackage) => {
                    if (contextMenu.groupType === 'creator') return (p.meta.creator || "Unknown") === contextMenu.key;
                    if (contextMenu.groupType === 'type') return (p.type || "Unknown") === contextMenu.key;
                    if (contextMenu.groupType === 'status') {
                        if (contextMenu.key === STATUS_FILTERS.ALL) return true;
                        if (contextMenu.key === STATUS_FILTERS.ENABLED) return p.isEnabled && !p.isCorrupt;
                        if (contextMenu.key === STATUS_FILTERS.DISABLED) return !p.isEnabled && !p.isCorrupt;
                        if (contextMenu.key === STATUS_FILTERS.MISSING_DEPS) return p.missingDeps && p.missingDeps.length > 0 && !p.isCorrupt;
                        if (contextMenu.key === STATUS_FILTERS.VERSION_CONFLICTS) return p.isDuplicate && !p.isCorrupt;
                        if (contextMenu.key === STATUS_FILTERS.EXACT_DUPLICATES) return p.isExactDuplicate && !p.isCorrupt;
                        if (contextMenu.key === STATUS_FILTERS.CORRUPT) return p.isCorrupt;
                    }
                    return false;
                };

                const hasDisabled = packages.some(p => isPackageInContext(p) && !p.isEnabled);
                const hasEnabled = packages.some(p => isPackageInContext(p) && p.isEnabled);
                // Broaden conflict detection to include exact duplicates
                const hasConflicts = packages.some(p => isPackageInContext(p) && (p.isDuplicate || p.isExactDuplicate));

                // Show cleanup if there are actual conflicts OR if we are in a grouping mode (Creator/Type) where manual cleanup is useful
                const showCleanup = hasConflicts || contextMenu.groupType === 'creator' || contextMenu.groupType === 'type';

                return (
                    <div className="fixed z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[160px]" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()}>
                        <div className="px-3 py-1 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-700/50 mb-1 truncate max-w-[200px]">{contextMenu.key}</div>
                        {hasDisabled && (
                            <button onClick={() => { handleSidebarAction('enable-all', contextMenu.groupType, contextMenu.key); setContextMenu(null); }} className="w-full text-left px-3 py-2 hover:bg-gray-700 flex items-center gap-2 text-sm text-gray-200">
                                <CheckCircle2 size={14} className="text-green-500" /> Enable All
                            </button>
                        )}
                        {hasEnabled && (
                            <button onClick={() => { handleSidebarAction('disable-all', contextMenu.groupType, contextMenu.key); setContextMenu(null); }} className="w-full text-left px-3 py-2 hover:bg-gray-700 flex items-center gap-2 text-sm text-gray-200">
                                <Power size={14} className="text-gray-400" /> Disable All
                            </button>
                        )}
                        <div className="border-b border-gray-700/50 my-1"></div>
                        {showCleanup && (
                            <button onClick={() => { handleSidebarAction('resolve-all', contextMenu.groupType, contextMenu.key); setContextMenu(null); }} className="w-full text-left px-3 py-2 hover:bg-gray-700 flex items-center gap-2 text-sm text-gray-200">
                                <Sparkles size={14} className="text-purple-400" /> Package Cleanup
                            </button>
                        )}
                        <div className="border-b border-gray-700/50 my-1"></div>
                        <button onClick={() => { handleSidebarAction('install-all', contextMenu.groupType, contextMenu.key); setContextMenu(null); }} className="w-full text-left px-3 py-2 hover:bg-gray-700 flex items-center gap-2 text-sm text-gray-200">
                            <Download size={14} className="text-blue-400" /> Install All to Library
                        </button>
                        {/* Delete All Corrupt — only shown for the Corrupt status group */}
                        {contextMenu.groupType === 'status' && contextMenu.key === STATUS_FILTERS.CORRUPT && (() => {
                            const corruptPkgs = packages.filter(p => p.isCorrupt);
                            if (corruptPkgs.length === 0) return null;
                            return (
                                <>
                                    <div className="border-b border-gray-700/50 my-1"></div>
                                    <button
                                        onClick={() => {
                                            setContextMenu(null);
                                            handleDeleteClick(corruptPkgs[0], corruptPkgs);
                                        }}
                                        className="w-full text-left px-3 py-2 hover:bg-red-900/40 flex items-center gap-2 text-sm text-red-400"
                                    >
                                        <Trash2 size={14} className="text-red-400" /> Delete ({corruptPkgs.length})
                                    </button>
                                </>
                            );
                        })()}
                    </div>
                );
            })()}

        </aside>
    );
};

export default Sidebar;
