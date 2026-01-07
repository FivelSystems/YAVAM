import { User, ChevronDown, ChevronRight, AlertTriangle, Copy, Layers, Package, Settings, CheckCircle2, CircleOff } from 'lucide-react';
import { VarPackage } from '../App';
import clsx from 'clsx';
import { useMemo, useState } from 'react';

interface SidebarProps {
    packages: VarPackage[];
    currentFilter: string;
    setFilter: (f: string) => void;
    selectedCreator: string | null;
    onFilterCreator: (c: string | null) => void;
    selectedType: string | null;
    onFilterType: (t: string | null) => void;
    onOpenSettings: () => void;
}

const Sidebar = ({ packages, currentFilter, setFilter, selectedCreator, onFilterCreator, selectedType, onFilterType, onOpenSettings }: SidebarProps) => {
    const [collapsed, setCollapsed] = useState({ status: false, creators: true, types: false });

    const toggleSection = (section: 'status' | 'creators' | 'types') => {
        setCollapsed(prev => ({ ...prev, [section]: !prev[section] }));
    };

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
        return Object.entries(counts).sort((a, b) => b[1] - a[1]); // Sort by count
    }, [packages]);

    return (
        <aside className="w-64 h-full bg-gray-800 border-r border-gray-700 flex flex-col shadow-xl z-20">
            <div className="p-6 flex items-center justify-between border-b border-gray-700">
                <div className="flex items-center gap-3">
                    <div className="bg-blue-600 p-2 rounded-lg">
                        <Package className="text-white" size={24} />
                    </div>
                    <h1 className="text-xl font-bold tracking-tight text-white">VAR Manager</h1>
                </div>
                <button onClick={onOpenSettings} className="text-gray-400 hover:text-white transition-colors" title="Settings">
                    <Settings size={20} />
                </button>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col custom-scrollbar overflow-y-auto">
                {/* Status Section */}
                <div className="p-4 pb-0">
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
                                className={clsx("w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm",
                                    currentFilter === 'all' ? "bg-blue-600/10 text-blue-400" : "text-gray-400 hover:bg-gray-700 hover:text-white")}
                            >
                                <Layers size={18} /> All Packages
                            </button>

                            <button
                                onClick={() => setFilter('enabled')}
                                className={clsx("w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm",
                                    currentFilter === 'enabled' ? "bg-green-500/10 text-green-400" : "text-gray-400 hover:bg-gray-700 hover:text-white")}
                            >
                                <CheckCircle2 size={18} /> Enabled
                            </button>
                            <button
                                onClick={() => setFilter('disabled')}
                                className={clsx("w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm",
                                    currentFilter === 'disabled' ? "bg-red-500/10 text-red-400" : "text-gray-400 hover:bg-gray-700 hover:text-white")}
                            >
                                <CircleOff size={18} /> Disabled
                            </button>
                            <button
                                onClick={() => setFilter('missing-deps')}
                                className={clsx("w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm",
                                    currentFilter === 'missing-deps' ? "bg-orange-500/10 text-orange-400" : "text-gray-400 hover:bg-gray-700 hover:text-white")}
                            >
                                <AlertTriangle size={18} /> Missing Refs
                            </button>
                            <button
                                onClick={() => setFilter('duplicates')}
                                className={clsx("w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm",
                                    currentFilter === 'duplicates' ? "bg-yellow-500/10 text-yellow-400" : "text-gray-400 hover:bg-gray-700 hover:text-white")}
                            >
                                <Copy size={18} /> Multiple Versions
                            </button>
                        </div>
                    )}
                </div>

                <div className="p-4">
                    <button
                        onClick={() => toggleSection('creators')}
                        className="w-full flex items-center justify-between text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2 hover:text-gray-300"
                    >
                        <span>Creators</span>
                        {!collapsed.creators ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>

                    {!collapsed.creators && (
                        <div className="space-y-1">
                            <button
                                onClick={() => onFilterCreator(null)}
                                className={clsx("w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm",
                                    selectedCreator === null ? "bg-blue-600/10 text-blue-400" : "text-gray-400 hover:bg-gray-700 hover:text-white")}
                            >
                                <User size={18} /> All Creators
                            </button>
                            {creators.map(([name, count]) => (
                                <button
                                    key={name}
                                    onClick={() => onFilterCreator(name)}
                                    className={clsx("w-full flex items-center justify-between px-3 py-2 rounded-md transition-colors text-sm group",
                                        selectedCreator === name ? "bg-blue-600/10 text-blue-400" : "text-gray-400 hover:bg-gray-700 hover:text-white")}
                                >
                                    <span className="truncate text-left flex-1">{name}</span>
                                    <span className="text-xs bg-gray-700 px-1.5 py-0.5 rounded-full group-hover:bg-gray-600 text-gray-300">{count}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Categories (Types) Section */}
                <div className="p-4 pb-0">
                    <button
                        onClick={() => toggleSection('types')}
                        className="w-full flex items-center justify-between text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2 hover:text-gray-300"
                    >
                        <span>Categories</span>
                        {!collapsed.types ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>

                    {!collapsed.types && (
                        <div className="space-y-1">
                            <button
                                onClick={() => onFilterType(null)}
                                className={clsx("w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm",
                                    selectedType === null ? "bg-blue-600/10 text-blue-400" : "text-gray-400 hover:bg-gray-700 hover:text-white")}
                            >
                                <Layers size={18} /> All Categories
                            </button>
                            {types.map(([name, count]) => (
                                <button
                                    key={name}
                                    onClick={() => onFilterType(name)}
                                    className={clsx("w-full flex items-center justify-between px-3 py-2 rounded-md transition-colors text-sm group",
                                        selectedType === name ? "bg-blue-600/10 text-blue-400" : "text-gray-400 hover:bg-gray-700 hover:text-white")}
                                >
                                    <span className="truncate text-left flex-1">{name}</span>
                                    <span className="text-xs bg-gray-700 px-1.5 py-0.5 rounded-full group-hover:bg-gray-600 text-gray-300">{count}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="p-4 border-t border-gray-700 text-xs text-gray-500 text-center">
                v1.1.0 Beta
            </div>
        </aside>
    );
};

export default Sidebar;
