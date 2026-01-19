import React from 'react';
import { clsx } from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import {
    Search, X, Filter, LayoutGrid, List, RefreshCw, PanelLeft,
    ArrowUpDown, ArrowUpAZ, ArrowDownZA, ArrowDownWideNarrow, ArrowUpNarrowWide, Calendar
} from 'lucide-react';
import { ScanProgressBar } from '../../components/common/ScanProgressBar';
import { useFilterContext } from '../../context/FilterContext';
import { usePackageContext } from '../../context/PackageContext';

interface FilterToolbarProps {
    isSidebarOpen: boolean;
    setIsSidebarOpen: (val: boolean) => void;
    viewMode: 'grid' | 'list';
    setViewMode: (val: 'grid' | 'list') => void;
    isTagsVisible: boolean;
    setIsTagsVisible: (val: boolean) => void;
}

export const FilterToolbar: React.FC<FilterToolbarProps> = ({
    isSidebarOpen, setIsSidebarOpen,
    viewMode, setViewMode,
    isTagsVisible, setIsTagsVisible
}) => {
    // Consume Logic Contexts
    const {
        searchQuery, setSearchQuery, inputRef,
        sortMode, isSortDropdownOpen, setIsSortDropdownOpen, handleSortChange,
        selectedTags, setSelectedTags,
        tagSearchQuery, setTagSearchQuery, isTagSearchOpen, setIsTagSearchOpen,
        filteredPkgs
    } = useFilterContext();

    // PackageContext provides availableTags and loading status
    const { loading, scanProgress, scanPackages, cancelScan, availableTags } = usePackageContext();

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

                    <div className="flex items-center gap-2 bg-gray-700 px-3 py-2 rounded-lg w-full md:max-w-md">
                        <Search size={18} className="text-gray-400 shrink-0" />
                        <input
                            ref={inputRef}
                            className="bg-transparent outline-none w-full text-sm placeholder-gray-500 text-gray-200"
                            placeholder="Search packages..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />

                        {/* Desktop: Sorting Dropdown inside Search Bar (Hidden on Mobile) */}
                        <div className="hidden md:block relative shrink-0">
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
                            {/* Backdrop */}
                            {isSortDropdownOpen && (
                                <div
                                    className="fixed inset-0 z-40 bg-transparent"
                                    onClick={() => setIsSortDropdownOpen(false)}
                                />
                            )}
                        </div>
                    </div>
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

                        <button
                            onClick={() => setIsTagsVisible(!isTagsVisible)}
                            className={clsx(
                                "p-2 rounded-lg bg-gray-700 transition-colors",
                                isTagsVisible ? "text-blue-400 bg-blue-400/10" : "text-gray-400 hover:text-white"
                            )}
                        >
                            <Filter size={18} />
                        </button>

                        <div className="flex items-center gap-1 bg-gray-700 p-1 rounded-lg">
                            <button onClick={() => setViewMode('grid')} className={clsx("p-1.5 rounded", viewMode === 'grid' ? "bg-gray-600 text-white" : "text-gray-400")}><LayoutGrid size={18} /></button>
                            <button onClick={() => setViewMode('list')} className={clsx("p-1.5 rounded", viewMode === 'list' ? "bg-gray-600 text-white" : "text-gray-400")}><List size={18} /></button>
                        </div>
                    </div>

                    {/* Desktop Only Controls */}
                    <div className="hidden md:flex items-center gap-4">
                        <button
                            onClick={() => setIsTagsVisible(!isTagsVisible)}
                            className={clsx(
                                "p-2 rounded-lg transition-colors",
                                isTagsVisible ? "text-blue-400 bg-blue-400/10" : "text-gray-400 hover:text-white hover:bg-gray-700"
                            )}
                            title="Toggle Tags"
                        >
                            <Filter size={20} />
                        </button>

                        <div className="w-px h-6 bg-gray-700"></div>

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
                                    <ScanProgressBar current={scanProgress.current} total={scanProgress.total} variant="circular" />
                                </div>
                                <div className="hidden md:block">
                                    <ScanProgressBar current={scanProgress.current} total={scanProgress.total} variant="linear" />
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

            {/* Tags Filter Bar */}
            <AnimatePresence>
                {isTagsVisible && availableTags.length > 0 && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="relative group px-4 pb-3 flex items-center gap-2">
                            {/* Tag Search Toggle */}
                            <div className={clsx(
                                "flex items-center bg-gray-700 rounded-full transition-all duration-300 ease-in-out overflow-hidden shrink-0",
                                isTagSearchOpen ? "w-48 px-3 py-1" : "w-8 h-8 justify-center cursor-pointer hover:bg-gray-600"
                            )} onClick={() => !isTagSearchOpen && setIsTagSearchOpen(true)}>
                                <Search size={14} className="text-gray-400 shrink-0" />
                                <input
                                    className={clsx(
                                        "bg-transparent outline-none text-xs text-white ml-2 w-full",
                                        !isTagSearchOpen && "hidden"
                                    )}
                                    placeholder="Filter tags..."
                                    value={tagSearchQuery}
                                    onChange={(e) => setTagSearchQuery(e.target.value)}
                                    onBlur={() => !tagSearchQuery && setIsTagSearchOpen(false)}
                                    autoFocus={isTagSearchOpen}
                                />
                                {isTagSearchOpen && tagSearchQuery && (
                                    <button onClick={(e) => { e.stopPropagation(); setTagSearchQuery(''); }} className="ml-1 text-gray-400 hover:text-white">
                                        <X size={12} />
                                    </button>
                                )}
                            </div>

                            <div className="flex gap-2 overflow-hidden flex-1 mask-linear-fade pr-8">
                                {[
                                    ...selectedTags,
                                    ...availableTags.filter(t =>
                                        !selectedTags.includes(t) &&
                                        t.toLowerCase().includes(tagSearchQuery.toLowerCase())
                                    )
                                ].map(tag => {
                                    const isSelected = selectedTags.includes(tag);
                                    return (
                                        <button
                                            key={tag}
                                            onClick={() => setSelectedTags(prev =>
                                                isSelected ? prev.filter(t => t !== tag) : [...prev, tag]
                                            )}
                                            className={clsx(
                                                "px-3 py-1 text-xs rounded-full border transition-colors whitespace-nowrap",
                                                isSelected
                                                    ? "bg-blue-600 border-blue-500 text-white"
                                                    : "bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600 hover:text-white"
                                            )}
                                        >
                                            {tag}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Fade Out Effect */}
                            <div className="absolute right-0 top-0 bottom-3 w-16 bg-gradient-to-l from-gray-800 to-transparent pointer-events-none"></div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </header>
    );
};
