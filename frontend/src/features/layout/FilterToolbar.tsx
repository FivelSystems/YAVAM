import React from 'react';
import { clsx } from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import {
    X, LayoutGrid, List, RefreshCw, PanelLeft,
    ArrowUpDown, ArrowUpAZ, ArrowDownZA, ArrowDownWideNarrow, ArrowUpNarrowWide, Calendar
} from 'lucide-react';
import { ScanProgressBar } from '../../components/common/ScanProgressBar';
import { useFilterContext } from '../../context/FilterContext';
import { usePackageContext } from '../../context/PackageContext';
import { SearchBar } from '../library/search/SearchBar';

interface FilterToolbarProps {
    isSidebarOpen: boolean;
    setIsSidebarOpen: (val: boolean) => void;
    viewMode: 'grid' | 'list';
    setViewMode: (val: 'grid' | 'list') => void;
}

export const FilterToolbar: React.FC<FilterToolbarProps> = ({
    isSidebarOpen, setIsSidebarOpen,
    viewMode, setViewMode
}) => {
    // Consume Logic Contexts
    const {
        sortMode, isSortDropdownOpen, setIsSortDropdownOpen, handleSortChange,
        filteredPkgs
    } = useFilterContext();

    // PackageContext provides scanStages (three-phase) and loading state
    const { loading, scanStages, scanPackages, cancelScan } = usePackageContext();

    const sortOptions = [
        { id: 'name-asc', label: 'Name (A-Z)', icon: <ArrowUpAZ size={14} /> },
        { id: 'name-desc', label: 'Name (Z-A)', icon: <ArrowDownZA size={14} /> },
        { id: 'size-desc', label: 'Size (Largest)', icon: <ArrowDownWideNarrow size={14} /> },
        { id: 'size-asc', label: 'Size (Smallest)', icon: <ArrowUpNarrowWide size={14} /> },
        { id: 'date-newest', label: 'Date (Newest)', icon: <Calendar size={14} /> },
        { id: 'date-oldest', label: 'Date (Oldest)', icon: <Calendar size={14} /> },
    ];

    return (
        <header className="flex flex-col bg-gray-800 border-b border-gray-700 shadow-md z-30 shrink-0">
            <div className="flex flex-col md:flex-row md:justify-between items-center p-4 gap-4 md:gap-0">

                {/* Left Group: Toggle + Search */}
                <div className="flex items-center gap-3 w-full md:flex-1 md:min-w-0 md:mr-8">
                    {/* Mobile Toggle */}
                    <button
                        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                        className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors shrink-0 md:hidden"
                        title="Toggle Sidebar"
                    >
                        <PanelLeft size={20} />
                    </button>
                    {/* Desktop Toggle */}
                    <button
                        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                        className="hidden md:block p-2 -ml-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors shrink-0"
                        title="Toggle Sidebar"
                    >
                        <PanelLeft size={20} />
                    </button>

                    {/* Tokenised search: chips + autocomplete. Each token commits deliberately
                        (Enter/space/pick), so free typing never thrashes the grid mid-scan. */}
                    <SearchBar
                        trailing={
                            <div className="hidden md:block relative">
                                <button
                                    onClick={() => setIsSortDropdownOpen(!isSortDropdownOpen)}
                                    className={clsx(
                                        "p-1 rounded hover:bg-gray-600 text-gray-400 hover:text-white transition-colors",
                                        isSortDropdownOpen && "bg-gray-600 text-white"
                                    )}
                                    title="Sort Options"
                                >
                                    <ArrowUpDown size={16} />
                                </button>
                                <AnimatePresence>
                                    {isSortDropdownOpen && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                            className="absolute right-0 top-full mt-2 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden"
                                        >
                                            <div className="flex flex-col py-1">
                                                {sortOptions.map(opt => (
                                                    <button
                                                        key={opt.id}
                                                        onClick={() => {
                                                            handleSortChange(opt.id);
                                                            setIsSortDropdownOpen(false);
                                                        }}
                                                        className={clsx(
                                                            "flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-700 transition-colors",
                                                            sortMode === opt.id ? "text-blue-400 bg-blue-400/10" : "text-gray-300"
                                                        )}
                                                    >
                                                        {opt.icon}
                                                        <span>{opt.label}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                                {isSortDropdownOpen && (
                                    <div
                                        className="fixed inset-0 z-40 bg-transparent"
                                        onClick={() => setIsSortDropdownOpen(false)}
                                    />
                                )}
                            </div>
                        }
                    />
                </div>

                {/* Right Group: Actions */}
                <div className="flex items-center justify-between w-full md:w-auto md:justify-end gap-4 shrink-0">

                    {/* Mobile-Only Group for Sorting/Tags/View */}
                    <div className="flex items-center gap-2 md:hidden">
                        {/* Mobile Sorting */}
                        <div className="relative shrink-0">
                            <button
                                onClick={() => setIsSortDropdownOpen(!isSortDropdownOpen)}
                                className={clsx(
                                    "p-2 rounded-lg bg-gray-700 text-gray-400 hover:text-white transition-colors",
                                    isSortDropdownOpen && "bg-gray-600 text-white"
                                )}
                                title="Sort Options"
                            >
                                <ArrowUpDown size={18} />
                            </button>
                            <AnimatePresence>
                                {isSortDropdownOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                        className="absolute left-0 top-full mt-2 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden"
                                        style={{ left: 0 }}
                                    >
                                        <div className="flex flex-col py-1">
                                            {sortOptions.map(opt => (
                                                <button
                                                    key={opt.id}
                                                    onClick={() => {
                                                        handleSortChange(opt.id);
                                                        setIsSortDropdownOpen(false);
                                                    }}
                                                    className={clsx(
                                                        "flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-700 transition-colors",
                                                        sortMode === opt.id ? "text-blue-400 bg-blue-400/10" : "text-gray-300"
                                                    )}
                                                >
                                                    {opt.icon}
                                                    <span>{opt.label}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                            {/* Mobile Sort Backdrop */}
                            {isSortDropdownOpen && (
                                <div
                                    className="fixed inset-0 z-40 bg-transparent"
                                    onClick={() => setIsSortDropdownOpen(false)}
                                />
                            )}
                        </div>

                        <div className="flex items-center gap-1 bg-gray-700 p-1 rounded-lg">
                            <button onClick={() => setViewMode('grid')} className={clsx("p-1.5 rounded", viewMode === 'grid' ? "bg-gray-600 text-white" : "text-gray-400")}><LayoutGrid size={18} /></button>
                            <button onClick={() => setViewMode('list')} className={clsx("p-1.5 rounded", viewMode === 'list' ? "bg-gray-600 text-white" : "text-gray-400")}><List size={18} /></button>
                        </div>
                    </div>

                    {/* Desktop Only Controls */}
                    <div className="hidden md:flex items-center gap-4">
                        <div className="flex items-center gap-1 bg-gray-700 p-1 rounded-lg">
                            <button
                                onClick={() => setViewMode('grid')}
                                className={clsx("p-1.5 rounded transition-all", viewMode === 'grid' ? "bg-gray-600 text-white shadow" : "text-gray-400 hover:text-gray-200")}
                                title="Grid View"
                            >
                                <LayoutGrid size={18} />
                            </button>
                            <button
                                onClick={() => setViewMode('list')}
                                className={clsx("p-1.5 rounded transition-all", viewMode === 'list' ? "bg-gray-600 text-white shadow" : "text-gray-400 hover:text-gray-200")}
                                title="List View"
                            >
                                <List size={18} />
                            </button>
                        </div>

                        <div className="w-px h-6 bg-gray-700"></div>
                    </div>

                    {/* Progress & Refresh */}
                    <div className="flex items-center gap-4 text-sm text-gray-400 ml-auto md:ml-0">
                        {loading ? (
                            <>
                                <div className="md:hidden">
                                    <ScanProgressBar stages={scanStages} variant="circular" />
                                </div>
                                <div className="hidden md:block">
                                    <ScanProgressBar stages={scanStages} variant="linear" />
                                </div>
                            </>
                        ) : (
                            <span className="hidden sm:inline">{filteredPkgs.length} packages found</span>
                        )}
                        <button
                            onClick={() => scanPackages()}
                            className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors"
                            title="Refresh Packages"
                        >
                            <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
                        </button>
                        {loading && (
                            <button
                                onClick={() => cancelScan()}
                                className="p-2 hover:bg-red-500/10 rounded-lg text-gray-400 hover:text-red-500 transition-colors"
                                title="Cancel Scan"
                            >
                                <X size={20} />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </header>
    );
};
