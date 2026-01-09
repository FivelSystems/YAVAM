import { ChevronDown, ChevronRight, AlertTriangle, Copy, Layers, Package, Settings, CheckCircle2, CircleOff, Power, Hammer, Trash2, GripVertical } from 'lucide-react';
import { VarPackage } from '../App';
import clsx from 'clsx';
import { useMemo, useState, useEffect } from 'react';
import { Reorder, useDragControls } from "framer-motion";

interface SidebarProps {
    packages: VarPackage[];
    currentFilter: string;
    setFilter: (f: string) => void;
    selectedCreator: string | null;
    onFilterCreator: (c: string | null) => void;
    selectedType: string | null;
    onFilterType: (t: string | null) => void;
    onOpenSettings: () => void;
    // Library Switcher
    libraries: string[];
    currentLibIndex: number;
    onSelectLibrary: (index: number) => void;
    onRemoveLibrary?: (index: number) => void;
    onReorderLibraries?: (files: string[]) => void;
    onAddLibrary?: () => void;
    // Status & Actions
    creatorStatus: Record<string, 'normal' | 'warning' | 'error'>;
    typeStatus: Record<string, 'normal' | 'warning' | 'error'>;
    onSidebarAction: (action: 'enable-all' | 'disable-all' | 'resolve-all', groupType: 'creator' | 'type' | 'status', key: string) => void;
}

const SidebarLibraryItem = ({ lib, idx, isActive, onSelect, onRemove }: { lib: string, idx: number, isActive: boolean, onSelect: () => void, onRemove?: (idx: number) => void }) => {
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
                    <div className={clsx("text-sm font-medium truncate", isActive ? "text-blue-400" : "text-gray-300")}>
                        {lib.split(/[/\\]/).pop()}
                    </div>
                    <div className="text-[10px] text-gray-600 truncate" title={lib}>{lib}</div>
                </div>

                {onRemove && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onRemove(idx); }}
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

const Sidebar = ({ packages, currentFilter, setFilter, selectedCreator, onFilterCreator, selectedType, onFilterType, onOpenSettings, libraries, currentLibIndex, onSelectLibrary, onRemoveLibrary, onReorderLibraries, onAddLibrary, creatorStatus, typeStatus, onSidebarAction }: SidebarProps) => {
    const [collapsed, setCollapsed] = useState({ status: false, creators: true, types: false });
    const [isLibDropdownOpen, setIsLibDropdownOpen] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ open: boolean, x: number, y: number, groupType: 'creator' | 'type' | 'status', key: string } | null>(null);

    const currentLibPath = libraries && libraries[currentLibIndex] ? libraries[currentLibIndex] : "No Library Selected";
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

    const types = useMemo(() => {
        const counts: Record<string, number> = {};
        packages.forEach(p => {
            // Use Primary Type only to avoid noise
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
        return Object.entries(counts).sort((a, b) => b[1] - a[1]); // Sort by count
    }, [packages]);

    const statusCounts = useMemo(() => {
        return {
            all: packages.length,
            enabled: packages.filter(p => p.isEnabled).length,
            disabled: packages.filter(p => !p.isEnabled).length,
            missingDeps: packages.filter(p => p.missingDeps && p.missingDeps.length > 0).length,
            duplicates: packages.filter(p => p.isDuplicate).length
        };
    }, [packages]);

    return (
        <aside className="w-64 h-full bg-gray-800 border-r border-gray-700 flex flex-col shadow-xl z-20">
            {/* ... header ... */}
            <div className="p-4 border-b border-gray-700 bg-gray-800/50">
                <div className="flex items-center gap-2 mb-2">
                    {/* Icon */}
                    <div className="bg-blue-600 p-1.5 rounded-lg shrink-0">
                        <Package className="text-white" size={20} />
                    </div>
                    {/* Library Switcher */}
                    <div className="flex-1 flex items-center justify-between bg-gray-900/50 rounded-lg p-1 border border-gray-700/50 relative min-w-0">
                        <button
                            onClick={() => onSelectLibrary((currentLibIndex - 1 + libraries.length) % libraries.length)}
                            className="p-1 hover:text-white text-gray-500 transition-colors"
                            disabled={libraries.length <= 1}
                        >
                            <ChevronDown className="rotate-90" size={16} />{/* ChevronLeft equivalent if rotated? Or just import ChevronLeft */}
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
                            onClick={() => onSelectLibrary((currentLibIndex + 1) % libraries.length)}
                            className="p-1 hover:text-white text-gray-500 transition-colors"
                            disabled={libraries.length <= 1}
                        >
                            <ChevronRight size={16} />
                        </button>

                        {/* Dropdown */}
                        {isLibDropdownOpen && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setIsLibDropdownOpen(false)}></div>
                                <div className="absolute top-full left-0 mt-2 w-72 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-20 py-2 flex flex-col max-h-[80vh] overflow-y-auto">
                                    <Reorder.Group
                                        axis="y"
                                        values={libraries}
                                        onReorder={(newOrder) => onReorderLibraries && onReorderLibraries(newOrder)}
                                        className="flex flex-col gap-0.5 px-1"
                                        layoutScroll
                                    >
                                        {libraries.map((lib, idx) => (
                                            <SidebarLibraryItem
                                                key={lib}
                                                lib={lib}
                                                idx={idx}
                                                isActive={idx === currentLibIndex}
                                                onSelect={() => { onSelectLibrary(idx); setIsLibDropdownOpen(false); }}
                                                onRemove={onRemoveLibrary}
                                            />
                                        ))}
                                    </Reorder.Group>
                                    <div className="border-t border-gray-700/50 mt-1 pt-1 px-1 pb-1">
                                        {onAddLibrary && (
                                            <button
                                                onClick={() => { onAddLibrary(); setIsLibDropdownOpen(false); }}
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

                    {/* Config Button (Untouched) */}
                    <button onClick={onOpenSettings} className="text-gray-400 hover:text-white transition-colors shrink-0 ml-1" title="Settings">
                        <Settings size={20} />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col custom-scrollbar overflow-y-auto">
                {/* Status Section */}
                <div className="p-4 border-b border-gray-700/50">
                    <button
                        onClick={() => toggleSection('status')}
                        className="w-full flex items-center justify-between text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2 hover:text-gray-300"
                    >
                        <span>Status</span>
                        {!collapsed.status ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>

                    {!collapsed.status && (
                        <div className="space-y-1 animation-fade-in">
                            <button
                                onClick={() => setFilter('all')}
                                onContextMenu={(e) => handleContextMenu(e, 'status', 'all')}
                                className={clsx("w-full flex items-center justify-between px-3 py-2 rounded-md transition-colors text-sm group",
                                    currentFilter === 'all' ? "bg-blue-600/10 text-blue-400" : "text-gray-400 hover:bg-gray-700 hover:text-white")}
                            >
                                <div className="flex items-center gap-3"><Layers size={18} /> All Packages</div>
                                <span className={clsx("text-xs px-2 py-0.5 rounded-full font-medium transition-colors",
                                    currentFilter === 'all' ? "bg-blue-500/20 text-blue-300" : "bg-gray-800 text-gray-400 group-hover:bg-gray-700 group-hover:text-gray-300"
                                )}>{statusCounts.all}</span>
                            </button>

                            {statusCounts.enabled > 0 && (
                                <button
                                    onClick={() => setFilter(currentFilter === 'enabled' ? 'all' : 'enabled')}
                                    onContextMenu={(e) => handleContextMenu(e, 'status', 'enabled')}
                                    className={clsx("w-full flex items-center justify-between px-3 py-2 rounded-md transition-colors text-sm group",
                                        currentFilter === 'enabled' ? "bg-green-500/10 text-green-400" : "text-gray-400 hover:bg-gray-700 hover:text-white")}
                                >
                                    <div className="flex items-center gap-3"><CheckCircle2 size={18} /> Enabled</div>
                                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-500/20 text-green-400 border border-green-500/10 group-hover:bg-green-500/30 transition-colors">{statusCounts.enabled}</span>
                                </button>
                            )}

                            {statusCounts.disabled > 0 && (
                                <button
                                    onClick={() => setFilter(currentFilter === 'disabled' ? 'all' : 'disabled')}
                                    onContextMenu={(e) => handleContextMenu(e, 'status', 'disabled')}
                                    className={clsx("w-full flex items-center justify-between px-3 py-2 rounded-md transition-colors text-sm group",
                                        currentFilter === 'disabled' ? "bg-gray-600/20 text-gray-200" : "text-gray-400 hover:bg-gray-700 hover:text-white")}
                                >
                                    <div className="flex items-center gap-3"><CircleOff size={18} /> Disabled</div>
                                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-700 text-gray-300 border border-gray-600 group-hover:bg-gray-600 transition-colors">{statusCounts.disabled}</span>
                                </button>
                            )}

                            {statusCounts.missingDeps > 0 && (
                                <button
                                    onClick={() => setFilter(currentFilter === 'missing-deps' ? 'all' : 'missing-deps')}
                                    onContextMenu={(e) => handleContextMenu(e, 'status', 'missing-deps')}
                                    className={clsx("w-full flex items-center justify-between px-3 py-2 rounded-md transition-colors text-sm group",
                                        currentFilter === 'missing-deps' ? "bg-red-500/10 text-red-400" : "text-gray-400 hover:bg-gray-700 hover:text-white")}
                                >
                                    <div className="flex items-center gap-3"><AlertTriangle size={18} /> Missing Refs</div>
                                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-500/20 text-red-400 border border-red-500/10 group-hover:bg-red-500/30 transition-colors">{statusCounts.missingDeps}</span>
                                </button>
                            )}

                            {statusCounts.duplicates > 0 && (
                                <button
                                    onClick={() => setFilter(currentFilter === 'duplicates' ? 'all' : 'duplicates')}
                                    onContextMenu={(e) => handleContextMenu(e, 'status', 'duplicates')}
                                    className={clsx("w-full flex items-center justify-between px-3 py-2 rounded-md transition-colors text-sm group",
                                        currentFilter === 'duplicates' ? "bg-yellow-500/10 text-yellow-400" : "text-gray-400 hover:bg-gray-700 hover:text-white")}
                                >
                                    <div className="flex items-center gap-3"><Copy size={18} /> Multiple Versions</div>
                                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/10 group-hover:bg-yellow-500/30 transition-colors">{statusCounts.duplicates}</span>
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <div className="p-4 border-b border-gray-700/50">
                    <button
                        onClick={() => toggleSection('creators')}
                        className="w-full flex items-center justify-between text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2 hover:text-gray-300"
                    >
                        <span>Creators</span>
                        {!collapsed.creators ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>

                    {!collapsed.creators && (
                        <div className="space-y-1">
                            {creators.map(([name, count]) => (
                                <button
                                    key={name}
                                    onClick={() => onFilterCreator(selectedCreator === name ? null : name)}
                                    // Add Context Menu Trigger
                                    onContextMenu={(e) => handleContextMenu(e, 'creator', name)}
                                    className={clsx("w-full flex items-center justify-between px-3 py-2 rounded-md transition-colors text-sm group",
                                        selectedCreator === name ? "bg-blue-600/10 text-blue-400" : "text-gray-400 hover:bg-gray-700 hover:text-white")}
                                >
                                    <span className="truncate text-left flex-1">{name}</span>
                                    {/* Use getStatusClasses for the badge */}
                                    <span className={clsx("text-xs px-1.5 py-0.5 rounded-full transition-colors border border-transparent", getStatusClasses(creatorStatus[name], selectedCreator === name))}>{count}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Categories (Types) Section */}
                <div className="p-4 border-b border-gray-700/50">
                    <button
                        onClick={() => toggleSection('types')}
                        className="w-full flex items-center justify-between text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2 hover:text-gray-300"
                    >
                        <span>Categories</span>
                        {!collapsed.types ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>

                    {!collapsed.types && (
                        <div className="space-y-1">
                            {types.map(([name, count]) => (
                                <button
                                    key={name}
                                    onClick={() => onFilterType(selectedType === name ? null : name)}
                                    // Add Context Menu Trigger
                                    onContextMenu={(e) => handleContextMenu(e, 'type', name)}
                                    className={clsx("w-full flex items-center justify-between px-3 py-2 rounded-md transition-colors text-sm group",
                                        selectedType === name ? "bg-blue-600/10 text-blue-400" : "text-gray-400 hover:bg-gray-700 hover:text-white")}
                                >
                                    <span className="truncate text-left flex-1">{name}</span>
                                    {/* Use getStatusClasses for the badge */}
                                    <span className={clsx("text-xs px-1.5 py-0.5 rounded-full transition-colors border border-transparent", getStatusClasses(typeStatus[name], selectedType === name))}>{count}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>



            {/* Sidebar Context Menu */}
            {contextMenu && (
                <div
                    className="fixed z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[160px]"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="px-3 py-1 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-700/50 mb-1 truncate max-w-[200px]">
                        {contextMenu.key}
                    </div>
                    <button onClick={() => { onSidebarAction('enable-all', contextMenu.groupType, contextMenu.key); setContextMenu(null); }} className="w-full text-left px-3 py-2 hover:bg-gray-700 flex items-center gap-2 text-sm text-gray-200">
                        <CheckCircle2 size={14} className="text-green-500" /> Enable All
                    </button>
                    <button onClick={() => { onSidebarAction('disable-all', contextMenu.groupType, contextMenu.key); setContextMenu(null); }} className="w-full text-left px-3 py-2 hover:bg-gray-700 flex items-center gap-2 text-sm text-gray-200">
                        <Power size={14} className="text-gray-400" /> Disable All
                    </button>
                    {/* Conditional Fix Conflicts Button */}
                    {packages.some(p => {
                        if (contextMenu.groupType === 'creator') return (p.meta.creator || "Unknown") === contextMenu.key && p.isDuplicate;
                        if (contextMenu.groupType === 'type') {
                            const t = p.type || "Unknown";
                            return t === contextMenu.key && p.isDuplicate;
                        }
                        if (contextMenu.groupType === 'status') {
                            if (contextMenu.key === 'all') return p.isDuplicate;
                            if (contextMenu.key === 'enabled') return p.isEnabled && p.isDuplicate;
                            if (contextMenu.key === 'disabled') return !p.isEnabled && p.isDuplicate;
                            if (contextMenu.key === 'missing-deps') return p.missingDeps && p.missingDeps.length > 0 && p.isDuplicate;
                            if (contextMenu.key === 'duplicates') return true;
                        }
                        return false;
                    }) && (
                            <button onClick={() => { onSidebarAction('resolve-all', contextMenu.groupType, contextMenu.key); setContextMenu(null); }} className="w-full text-left px-3 py-2 hover:bg-gray-700 flex items-center gap-2 text-sm text-gray-200">
                                <Hammer size={14} className="text-yellow-500" /> Fix Conflicts
                            </button>
                        )}
                </div>
            )}
        </aside>
    );
};

export default Sidebar;
