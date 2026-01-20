import { ChevronDown, ChevronRight, Layers, Package, Settings, CheckCircle2, CircleOff, Power, Sparkles, Trash2, GripVertical, Download, AlertCircle, AlertTriangle, Copy, Unlink } from 'lucide-react';
import { VarPackage } from '../../types';
import clsx from 'clsx';
import { useMemo, useState, useEffect } from 'react';
import { Reorder, useDragControls } from "framer-motion";
import { usePackageContext } from '../../context/PackageContext';
import { useFilterContext } from '../../context/FilterContext';
import { useLibraryContext } from '../../context/LibraryContext';
import { useActionContext } from '../../context/ActionContext';
import { STATUS_FILTERS } from '../../constants';

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


const getStatusClasses = (status: 'normal' | 'warning' | 'error' | undefined, isSelected: boolean) => {
    if (status === 'warning') return "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30";
    if (status === 'error') return "bg-red-500/20 text-red-400 border border-red-500/30";
    return isSelected
        ? "bg-blue-600/20 text-blue-300" // Normal Selected
        : "bg-gray-700 text-gray-400 group-hover:bg-gray-600"; // Normal Unselected
};

type SidebarProps = {
    // UI Only Props
    onOpenSettings: () => void;
};

const Sidebar = ({ onOpenSettings }: SidebarProps) => {
    // Context Consumption
    const { packages, creatorStatus, typeStatus } = usePackageContext();
    const {
        currentFilter, setCurrentFilter,
        selectedCreator, setSelectedCreator,
        selectedType, setSelectedType
    } = useFilterContext();
    const {
        libraries, activeLibIndex, selectLibrary,
        removeLibrary, reorderLibraries, browseAndAdd
    } = useLibraryContext();
    const { handleSidebarAction } = useActionContext();

    // Local State
    const [collapsed, setCollapsed] = useState({ status: false, creators: true, types: false });
    const [isLibDropdownOpen, setIsLibDropdownOpen] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ open: boolean, x: number, y: number, groupType: 'creator' | 'type' | 'status', key: string } | null>(null);
    const [libraryCounts, setLibraryCounts] = useState<Record<string, number>>({});

    useEffect(() => {
        if (window.go && window.go.main && window.go.main.App && libraries.length > 0) {
            window.go.main.App.GetLibraryCounts(libraries).then(counts => {
                setLibraryCounts(counts);
            });
        }
    }, [libraries]);

    const currentLibPath = libraries && libraries[activeLibIndex] ? libraries[activeLibIndex] : "No Library Selected";
    const currentLibName = currentLibPath.split(/[/\\]/).pop() || "Library";

    const toggleSection = (section: 'status' | 'creators' | 'types') => {
        setCollapsed(prev => ({ ...prev, [section]: !prev[section] }));
    };

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

    // Memoized Lists (Moved from Props to Context-Derived)
    const types = useMemo(() => {
        const counts: Record<string, number> = {};
        packages.forEach(p => {
            const t = p.type || "Unknown";
            counts[t] = (counts[t] || 0) + 1;
        });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]);
    }, [packages]);

    const creators = useMemo(() => {
        const counts: Record<string, number> = {};
        packages.forEach(p => {
            const c = p.meta.creator || "Unknown";
            counts[c] = (counts[c] || 0) + 1;
        });
        return Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0]));
    }, [packages]);

    const statusCounts = useMemo(() => {
        const validPkgs = packages.filter(p => !p.isCorrupt);
        const corruptPkgs = packages.filter(p => p.isCorrupt);

        return {
            all: packages.length,
            enabled: validPkgs.filter(p => p.isEnabled).length,
            disabled: validPkgs.filter(p => !p.isEnabled).length,
            missingDeps: validPkgs.filter(p => p.missingDeps && p.missingDeps.length > 0).length,
            versionConflicts: validPkgs.filter(p => p.isDuplicate).length,
            exactDuplicates: validPkgs.filter(p => p.isExactDuplicate).length,
            orphans: validPkgs.filter(p => p.isOrphan).length,
            corrupt: corruptPkgs.length
        };
    }, [packages]);

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
                            <div className="font-bold text-gray-200 text-sm truncate leading-tight select-none" title={currentLibPath}>
                                {currentLibName}
                            </div>
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

            {/* Status Sections */}
            <div className="flex-1 overflow-hidden flex flex-col custom-scrollbar overflow-y-auto">
                {/* STATUS SECTION */}
                <div className="p-4 border-b border-gray-700/50">
                    <button onClick={() => toggleSection('status')} className="w-full flex items-center justify-between text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2 hover:text-gray-300">
                        <span>Status</span>
                        {!collapsed.status ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    {!collapsed.status && (
                        <div className="space-y-1 animation-fade-in">
                            {/* All */}
                            <button onClick={() => setCurrentFilter(STATUS_FILTERS.ALL)} onContextMenu={(e) => handleContextMenu(e, 'status', STATUS_FILTERS.ALL)} className={clsx("w-full flex items-center justify-between px-3 py-2 rounded-md transition-colors text-sm group", currentFilter === STATUS_FILTERS.ALL ? "bg-blue-600/10 text-blue-400" : "text-gray-400 hover:bg-gray-700 hover:text-white")}>
                                <div className="flex items-center gap-3"><Layers size={18} /> All Packages</div>
                                <span className={clsx("text-xs px-2 py-0.5 rounded-full font-medium transition-colors", currentFilter === STATUS_FILTERS.ALL ? "bg-blue-500/20 text-blue-300" : "bg-gray-800 text-gray-400 group-hover:bg-gray-700 group-hover:text-gray-300")}>{statusCounts.all}</span>
                            </button>
                            {/* Enabled */}
                            {statusCounts.enabled > 0 && (
                                <button onClick={() => setCurrentFilter(currentFilter === 'enabled' ? 'all' : 'enabled')} onContextMenu={(e) => handleContextMenu(e, 'status', 'enabled')} className={clsx("w-full flex items-center justify-between px-3 py-2 rounded-md transition-colors text-sm group", currentFilter === 'enabled' ? "bg-green-500/10 text-green-400" : "text-gray-400 hover:bg-gray-700 hover:text-white")}>
                                    <div className="flex items-center gap-3"><CheckCircle2 size={18} /> Enabled</div>
                                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-500/20 text-green-400 border border-green-500/10 group-hover:bg-green-500/30 transition-colors">{statusCounts.enabled}</span>
                                </button>
                            )}
                            {/* Disabled */}
                            {statusCounts.disabled > 0 && (
                                <button onClick={() => setCurrentFilter(currentFilter === 'disabled' ? 'all' : 'disabled')} onContextMenu={(e) => handleContextMenu(e, 'status', 'disabled')} className={clsx("w-full flex items-center justify-between px-3 py-2 rounded-md transition-colors text-sm group", currentFilter === 'disabled' ? "bg-gray-600/20 text-gray-200" : "text-gray-400 hover:bg-gray-700 hover:text-white")}>
                                    <div className="flex items-center gap-3"><CircleOff size={18} /> Disabled</div>
                                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-700 text-gray-300 border border-gray-600 group-hover:bg-gray-600 transition-colors">{statusCounts.disabled}</span>
                                </button>
                            )}
                            {/* Missing Dependencies */}
                            {statusCounts.missingDeps > 0 && (
                                <button onClick={() => setCurrentFilter(currentFilter === 'missing-deps' ? 'all' : 'missing-deps')} onContextMenu={(e) => handleContextMenu(e, 'status', 'missing-deps')} className={clsx("w-full flex items-center justify-between px-3 py-2 rounded-md transition-colors text-sm group", currentFilter === 'missing-deps' ? "bg-red-500/10 text-red-400" : "text-gray-400 hover:bg-gray-700 hover:text-white")}>
                                    <div className="flex items-center gap-3"><AlertCircle size={18} /> Missing Deps</div>
                                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-500/20 text-red-400 border border-red-500/10 group-hover:bg-red-500/30 transition-colors">{statusCounts.missingDeps}</span>
                                </button>
                            )}
                            {/* Version Conflicts (Obsolete) */}
                            {statusCounts.versionConflicts > 0 && (
                                <button onClick={() => setCurrentFilter(currentFilter === 'version-conflicts' ? 'all' : 'version-conflicts')} onContextMenu={(e) => handleContextMenu(e, 'status', 'version-conflicts')} className={clsx("w-full flex items-center justify-between px-3 py-2 rounded-md transition-colors text-sm group", currentFilter === 'version-conflicts' ? "bg-yellow-500/10 text-yellow-400" : "text-gray-400 hover:bg-gray-700 hover:text-white")}>
                                    <div className="flex items-center gap-3"><AlertTriangle size={18} /> Conflicts</div>
                                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/10 group-hover:bg-yellow-500/30 transition-colors">{statusCounts.versionConflicts}</span>
                                </button>
                            )}
                            {/* Exact Duplicates */}
                            {statusCounts.exactDuplicates > 0 && (
                                <button onClick={() => setCurrentFilter(currentFilter === 'exact-duplicates' ? 'all' : 'exact-duplicates')} onContextMenu={(e) => handleContextMenu(e, 'status', 'exact-duplicates')} className={clsx("w-full flex items-center justify-between px-3 py-2 rounded-md transition-colors text-sm group", currentFilter === 'exact-duplicates' ? "bg-purple-500/10 text-purple-400" : "text-gray-400 hover:bg-gray-700 hover:text-white")}>
                                    <div className="flex items-center gap-3"><Copy size={18} /> Duplicates</div>
                                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-purple-500/20 text-purple-400 border border-purple-500/10 group-hover:bg-purple-500/30 transition-colors">{statusCounts.exactDuplicates}</span>
                                </button>
                            )}
                            {/* Corrupt */}
                            {statusCounts.corrupt > 0 && (
                                <button onClick={() => setCurrentFilter(currentFilter === 'corrupt' ? 'all' : 'corrupt')} onContextMenu={(e) => handleContextMenu(e, 'status', 'corrupt')} className={clsx("w-full flex items-center justify-between px-3 py-2 rounded-md transition-colors text-sm group", currentFilter === 'corrupt' ? "bg-red-600/20 text-red-500" : "text-gray-400 hover:bg-gray-700 hover:text-white")}>
                                    <div className="flex items-center gap-3"><AlertTriangle size={18} /> Corrupt</div>
                                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-600/20 text-red-500 border border-red-600/10 group-hover:bg-red-600/30 transition-colors">{statusCounts.corrupt}</span>
                                </button>
                            )}
                            {/* Unreferenced (Orphans) */}
                            {statusCounts.orphans > 0 && (
                                <button onClick={() => setCurrentFilter(currentFilter === 'unreferenced' ? 'all' : 'unreferenced')} onContextMenu={(e) => handleContextMenu(e, 'status', 'unreferenced')} className={clsx("w-full flex items-center justify-between px-3 py-2 rounded-md transition-colors text-sm group", currentFilter === 'unreferenced' ? "bg-violet-600/20 text-violet-400" : "text-gray-400 hover:bg-gray-700 hover:text-white")}>
                                    <div className="flex items-center gap-3"><Unlink size={18} /> Unreferenced</div>
                                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-violet-600/20 text-violet-400 border border-violet-600/10 group-hover:bg-violet-600/30 transition-colors">{statusCounts.orphans}</span>
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* CREATORS */}
                <div className="p-4 border-b border-gray-700/50">
                    <button onClick={() => toggleSection('creators')} className="w-full flex items-center justify-between text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2 hover:text-gray-300">
                        <span>Creators</span>
                        {!collapsed.creators ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    {!collapsed.creators && (
                        <div className="space-y-1">
                            {creators.map(([name, count]) => (
                                <button
                                    key={name}
                                    onClick={() => setSelectedCreator(selectedCreator === name ? null : name)}
                                    onContextMenu={(e) => handleContextMenu(e, 'creator', name)}
                                    className={clsx("w-full flex items-center justify-between px-3 py-2 rounded-md transition-colors text-sm group", selectedCreator === name ? "bg-blue-600/10 text-blue-400" : "text-gray-400 hover:bg-gray-700 hover:text-white")}
                                >
                                    <span className="truncate text-left flex-1">{name}</span>
                                    <span className={clsx("text-xs px-1.5 py-0.5 rounded-full transition-colors border border-transparent", getStatusClasses(creatorStatus[name], selectedCreator === name))}>{count}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* TYPES */}
                <div className="p-4 border-b border-gray-700/50">
                    <button onClick={() => toggleSection('types')} className="w-full flex items-center justify-between text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2 hover:text-gray-300">
                        <span>Categories</span>
                        {!collapsed.types ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    {!collapsed.types && (
                        <div className="space-y-1">
                            {types.map(([name, count]) => (
                                <button
                                    key={name}
                                    onClick={() => setSelectedType(selectedType === name ? null : name)}
                                    onContextMenu={(e) => handleContextMenu(e, 'type', name)}
                                    className={clsx("w-full flex items-center justify-between px-3 py-2 rounded-md transition-colors text-sm group", selectedType === name ? "bg-blue-600/10 text-blue-400" : "text-gray-400 hover:bg-gray-700 hover:text-white")}
                                >
                                    <span className="truncate text-left flex-1">{name}</span>
                                    <span className={clsx("text-xs px-1.5 py-0.5 rounded-full transition-colors border border-transparent", getStatusClasses(typeStatus[name], selectedType === name))}>{count}</span>
                                </button>
                            ))}
                        </div>
                    )}
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
                        if (contextMenu.key === STATUS_FILTERS.UNREFERENCED) return p.isOrphan && !p.isCorrupt;
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
                    </div>
                );
            })()}

        </aside>
    );
};

export default Sidebar;
