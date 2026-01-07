import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { RefreshCw, Search, X, ChevronLeft, ChevronRight, Package, PanelLeft, LayoutGrid, List } from 'lucide-react';
import clsx from 'clsx';
import DragDropOverlay from './components/DragDropOverlay';
import ContextMenu from './components/ContextMenu';
import LoadingToast from './components/LoadingToast';
import CardGrid from './components/CardGrid';
import Sidebar from './components/Sidebar';

import VersionResolutionModal from './components/VersionResolutionModal';
import SettingsModal from './components/SettingsModal';
import ConfirmationModal from './components/ConfirmationModal';
import TagSearch from './components/TagSearch';
import RightSidebar from './components/RightSidebar';

// Define types based on our Go models
export interface VarPackage {
    filePath: string;
    fileName: string;
    size: number;
    meta: {
        creator: string;
        packageName: string;
        version: string;
        description?: string;
        dependencies?: Record<string, any>;
    };
    thumbnailPath: string;
    thumbnailBase64?: string;
    isEnabled: boolean;
    hasThumbnail: boolean;
    missingDeps: string[];
    isDuplicate: boolean;
    type?: string;
    tags?: string[];
}

function App() {
    // New Handler for Sidebar Selection

    const [selectedPackage, setSelectedPackage] = useState<VarPackage | null>(null);
    const [vamPath, setVamPath] = useState<string>(localStorage.getItem("vamPath") || "");
    const [packages, setPackages] = useState<VarPackage[]>([]);
    const [filteredPkgs, setFilteredPkgs] = useState<VarPackage[]>([]);
    const [availableTags, setAvailableTags] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    // Filter State
    const [searchQuery, setSearchQuery] = useState("");
    const [currentFilter, setCurrentFilter] = useState("all");
    const [selectedCreator, setSelectedCreator] = useState<string | null>(null);
    const [selectedType, setSelectedType] = useState<string | null>(null);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 50;

    // Settings
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [downloadPath, setDownloadPath] = useState<string>(localStorage.getItem("downloadPath") || "");
    const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 768);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>(window.innerWidth < 768 ? 'list' : 'grid');

    useEffect(() => {
        const handleResize = () => {
            const width = window.innerWidth;

            // Sidebar Logic
            if (width < 768) setIsSidebarOpen(false);
            else setIsSidebarOpen(true);

            // View Mode Logic - Mobile Phone Check
            if (width < 768) {
                setViewMode('list');
            } else {
                setViewMode('grid');
            }
        };

        // Run once on mount to ensure correct state
        // handleResize(); // intentionally skipped to respect initial state, but listener handles changes.

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);



    // Version Resolution State
    const [resolveData, setResolveData] = useState<{ open: boolean, duplicates: VarPackage[] }>({ open: false, duplicates: [] });

    // Context Menu State
    const [contextMenu, setContextMenu] = useState<{ open: boolean, x: number, y: number, pkg: VarPackage | null }>({ open: false, x: 0, y: 0, pkg: null });

    // Delete Confirmation State
    const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean, pkg: VarPackage | null }>({ open: false, pkg: null });

    const handlePackageClick = (pkg: VarPackage) => {
        if (selectedPackage?.filePath === pkg.filePath) {
            setSelectedPackage(null);
        } else {
            setSelectedPackage(pkg);
        }
    };

    const handleContextMenu = (e: React.MouseEvent, pkg: VarPackage) => {
        e.preventDefault();
        setContextMenu({
            open: true,
            x: e.clientX,
            y: e.clientY,
            pkg: pkg
        });
    };

    // Filters

    useEffect(() => {
        if (vamPath) {
            scanPackages();
        }
    }, [vamPath]);

    useEffect(() => {
        filterPackages();
        setCurrentPage(1);
    }, [packages, searchQuery, currentFilter, selectedCreator, selectedType, selectedTags]);

    const scanPackages = async () => {
        if (!vamPath) return;
        setLoading(true);
        try {
            // @ts-ignore
            const res = await window.go.main.App.ScanPackages(vamPath);
            setPackages(res.packages || []);
            setAvailableTags(res.tags || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const filterPackages = () => {
        let res = packages;

        // Status Filter
        if (currentFilter === "enabled") res = res.filter(p => p.isEnabled);
        if (currentFilter === "disabled") res = res.filter(p => !p.isEnabled);
        if (currentFilter === "missing-deps") res = res.filter(p => p.missingDeps && p.missingDeps.length > 0);
        if (currentFilter === "duplicates") res = res.filter(p => p.isDuplicate);

        // Creator Filter
        if (selectedCreator) res = res.filter(p => p.meta?.creator === selectedCreator);

        // Type Filter
        if (selectedType) res = res.filter(p => p.type === selectedType);

        // Tags Filter
        if (selectedTags.length > 0) {
            res = res.filter(p => {
                if (!p.tags) return false;
                return selectedTags.every(t => p.tags!.includes(t));
            });
        }

        // Search
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            res = res.filter(p =>
                p.fileName.toLowerCase().includes(q) ||
                p.meta?.creator?.toLowerCase().includes(q) ||
                p.meta?.packageName?.toLowerCase().includes(q)
            );
        }

        setFilteredPkgs(res);
    };

    const handleDrop = useCallback(async (files: string[]) => {
        console.log("Dropped files:", files);
        if (!vamPath) return;
        try {
            // @ts-ignore
            await window.go.main.App.InstallFiles(files, vamPath);
            scanPackages(); // Refresh
        } catch (e) {
            console.error(e);
            alert(e);
        }
    }, [vamPath]);

    const recalculateDuplicates = (currentPkgs: VarPackage[]): VarPackage[] => {
        const counts: Record<string, number> = {};
        // Count enabled instances
        currentPkgs.forEach(p => {
            if (p.isEnabled) {
                const key = `${p.meta.creator}.${p.meta.packageName}`;
                counts[key] = (counts[key] || 0) + 1;
            }
        });

        return currentPkgs.map(p => {
            if (!p.isEnabled) return { ...p, isDuplicate: false };
            const key = `${p.meta.creator}.${p.meta.packageName}`;
            return { ...p, isDuplicate: (counts[key] || 0) > 1 };
        });
    };

    const togglePackage = async (pkg: VarPackage) => {
        try {
            // @ts-ignore
            const newPath = await window.go.main.App.TogglePackage(pkg.filePath, !pkg.isEnabled, vamPath);

            // Optimistic update with path correction
            setPackages(prev => {
                const updated = prev.map(p =>
                    p.filePath === pkg.filePath ? { ...p, isEnabled: !p.isEnabled, filePath: newPath } : p
                );
                return recalculateDuplicates(updated);
            });
        } catch (e) {
            console.error(e);
        }
    };

    // Context Menu Handlers
    const handleOpenFolder = async (pkg: VarPackage) => {
        try {
            // @ts-ignore
            await window.go.main.App.OpenFolderInExplorer(pkg.filePath);
        } catch (e) { console.error(e); }
    };

    // Updated to use Copy Path
    const handleCopyPath = async (pkg: VarPackage) => {
        try {
            await navigator.clipboard.writeText(pkg.filePath);
            // Optional: Toast feedback?
        } catch (e) { console.error(e); }
    };

    const handleCopyFile = async (pkg: VarPackage) => {
        try {
            // @ts-ignore
            await window.go.main.App.CopyFileToClipboard(pkg.filePath);
        } catch (e) { console.error(e); }
    };

    const handleCutFile = async (pkg: VarPackage) => {
        try {
            // @ts-ignore
            await window.go.main.App.CutFileToClipboard(pkg.filePath);
        } catch (e) { console.error(e); }
    };

    const handleDownloadPackage = async (pkg: VarPackage) => {
        try {
            // @ts-ignore
            await window.go.main.App.DownloadPackage(pkg.filePath, downloadPath);
            // Optional: Toast or notification here
        } catch (e) {
            console.error(e);
            alert("Failed to download: " + e);
        }
    };

    const handleDeleteClick = (pkg: VarPackage) => {
        setDeleteConfirm({ open: true, pkg });
    };

    // ...



    const handleConfirmDelete = async () => {
        if (deleteConfirm.pkg) {
            try {
                // @ts-ignore
                await window.go.main.App.DeleteFileToRecycleBin(deleteConfirm.pkg.filePath);
                setDeleteConfirm({ open: false, pkg: null });
                scanPackages(); // Refresh list after delete
            } catch (e) {
                console.error(e);
                alert("Failed to delete file: " + e); // Fallback alert for error
            }
        }
    };



    const handleOpenResolve = (pkg: VarPackage) => {
        // Find enabled packages with same Creator & PackageName
        const dups = packages.filter(p =>
            p.isEnabled &&
            p.meta.creator === pkg.meta.creator &&
            p.meta.packageName === pkg.meta.packageName
        );
        // Include the clicked package if not already
        setResolveData({ open: true, duplicates: dups });
    };

    const handleConfirmResolve = async (keepPkg: VarPackage) => {
        const others = resolveData.duplicates.filter(p => p.filePath !== keepPkg.filePath);
        setResolveData({ open: false, duplicates: [] }); // Close immediately

        // Disable others
        for (const p of others) {
            await togglePackage(p); // This will trigger state updates and duplicate recalc
        }
    };

    if (!vamPath) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-900 text-white">
                <SettingsModal
                    isOpen={isSettingsOpen}
                    onClose={() => setIsSettingsOpen(false)}
                    libraryPath={vamPath}
                    onBrowseLibrary={async () => {
                        try {
                            // @ts-ignore
                            const p = await window.go.main.App.SelectDirectory();
                            if (p) {
                                setVamPath(p);
                                localStorage.setItem("vamPath", p);
                                setIsSettingsOpen(false);
                            }
                        } catch (e) { console.error(e); }
                    }}
                    downloadPath={downloadPath}
                    onBrowseDownload={async () => {
                        try {
                            // @ts-ignore
                            const p = await window.go.main.App.SelectDirectory();
                            if (p) {
                                setDownloadPath(p);
                                localStorage.setItem("downloadPath", p);
                            }
                        } catch (e) { console.error(e); }
                    }}
                    onResetDownload={() => {
                        setDownloadPath("");
                        localStorage.removeItem("downloadPath");
                    }}
                />
                <div className="text-center space-y-6 max-w-md w-full p-8 bg-gray-800 rounded-xl shadow-2xl border border-gray-700">
                    {/* ... (Welcome content same as before) ... */}
                    <div className="bg-blue-600 w-16 h-16 rounded-xl flex items-center justify-center mx-auto shadow-lg shadow-blue-900/20">
                        <Package size={32} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white mb-2">Welcome to VAR Manager</h1>
                        <p className="text-gray-400">Please select your Addon Packages repository folder (where .var files are stored/organized).</p>
                    </div>
                    <div className="flex gap-2 justify-center">
                        <input
                            type="text"
                            value={vamPath}
                            readOnly
                            placeholder="Select repository root folder..."
                            className="bg-gray-800 p-2 rounded w-96 border border-gray-700 text-gray-400 cursor-not-allowed"
                        />
                        <button
                            onClick={async () => {
                                try {
                                    // @ts-ignore
                                    const p = await window.go.main.App.SelectDirectory();
                                    if (p) {
                                        setVamPath(p);
                                        localStorage.setItem("vamPath", p);
                                    }
                                } catch (err) {
                                    console.error(err);
                                }
                            }}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded transition-colors flex items-center gap-2 font-medium"
                            title="Browse Folder"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" /></svg>
                            <span>Browse</span>
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="flex h-screen bg-gray-900 text-white overflow-hidden relative">
            <DragDropOverlay onDrop={handleDrop} />
            <LoadingToast visible={loading} />

            <VersionResolutionModal
                isOpen={resolveData.open}
                onClose={() => setResolveData(prev => ({ ...prev, open: false }))}
                duplicates={resolveData.duplicates}
                onResolve={handleConfirmResolve}
            />
            <SettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                libraryPath={vamPath}
                onBrowseLibrary={async () => {
                    try {
                        // @ts-ignore
                        const p = await window.go.main.App.SelectDirectory();
                        if (p) {
                            setVamPath(p);
                            localStorage.setItem("vamPath", p);
                        }
                    } catch (e) { console.error(e); }
                }}
                downloadPath={downloadPath}
                onBrowseDownload={async () => {
                    try {
                        // @ts-ignore
                        const p = await window.go.main.App.SelectDirectory();
                        if (p) {
                            setDownloadPath(p);
                            localStorage.setItem("downloadPath", p);
                        }
                    } catch (e) { console.error(e); }
                }}
                onResetDownload={() => {
                    setDownloadPath("");
                    localStorage.removeItem("downloadPath");
                }}
            />

            <ConfirmationModal
                isOpen={deleteConfirm.open}
                onClose={() => setDeleteConfirm({ open: false, pkg: null })}
                onConfirm={handleConfirmDelete}
                title="Delete Package"
                message={`Are you sure you want to delete "${deleteConfirm.pkg?.fileName}"? It will be moved to the Recycle Bin.`}
                confirmText="Delete"
                confirmStyle="danger"
            />

            {/* Hide sidebar on small screens when not needed, or use CSS media queries */}
            {/* Mobile Overlay Backdrop */}
            <AnimatePresence>
                {isSidebarOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setIsSidebarOpen(false)}
                        className="fixed inset-0 bg-black/50 z-30 md:hidden"
                    />
                )}
            </AnimatePresence>

            {/* Sidebar Wrapper */}
            <div className={clsx(
                "h-full z-40 transition-all duration-300 ease-in-out bg-gray-800 shrink-0",
                // Desktop: Relative positioning for flow
                "md:relative",
                // Mobile: Fixed absolute positioning
                "fixed inset-y-0 left-0 shadow-2xl md:shadow-none",
                // Open/Close States
                isSidebarOpen ? "w-64 translate-x-0" : "w-0 -translate-x-full md:translate-x-0 md:w-0 overflow-hidden"
            )}>
                <div className="w-64 h-full"> {/* Inner container to maintain width while parent animates */}
                    <Sidebar
                        packages={packages}
                        currentFilter={currentFilter}
                        setFilter={setCurrentFilter}
                        selectedCreator={selectedCreator}
                        onFilterCreator={setSelectedCreator}
                        selectedType={selectedType}
                        onFilterType={setSelectedType}
                        onOpenSettings={() => setIsSettingsOpen(true)}
                    />
                </div>
            </div>

            <main className="flex-1 flex flex-col overflow-hidden w-full">
                <header className="p-4 bg-gray-800 border-b border-gray-700 flex justify-between items-center shadow-md z-10 shrink-0">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                            className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                            title="Toggle Sidebar"
                        >
                            <PanelLeft size={20} />
                        </button>

                        <div className="flex items-center gap-2 bg-gray-700 px-3 py-2 rounded-lg w-64">
                            <Search size={18} className="text-gray-400" />
                            <input
                                className="bg-transparent outline-none w-full text-sm"
                                placeholder="Search..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
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
                        </div>

                        <TagSearch
                            availableTags={availableTags}
                            selectedTags={selectedTags}
                            onSelectTag={(tag) => setSelectedTags([...selectedTags, tag])}
                        />

                        {selectedTags.map(t => (
                            <button
                                key={t}
                                onClick={() => setSelectedTags(selectedTags.filter(x => x !== t))}
                                className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1 transition-colors"
                            >
                                {t} <X size={12} />
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-400">
                        <span>{filteredPkgs.length} packages found</span>
                        <button
                            onClick={scanPackages}
                            className="hover:text-white transition-colors"
                            title="Refresh Packages"
                        >
                            <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
                        </button>
                    </div>
                </header>

                <div className="flex-1 flex overflow-hidden">
                    <div className="flex-1 overflow-auto p-4 custom-scrollbar flex flex-col">
                        <CardGrid
                            packages={filteredPkgs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)}
                            currentPath={vamPath}
                            totalCount={packages.length}
                            onContextMenu={handleContextMenu}
                            onSelect={handlePackageClick}
                            selectedPkgId={selectedPackage?.filePath}
                            viewMode={viewMode}
                        />

                        {filteredPkgs.length > itemsPerPage && (
                            <div className="flex justify-center items-center gap-4 py-4 mt-4 border-t border-gray-700 bg-gray-800/50 backdrop-blur sticky bottom-0">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="p-2 rounded bg-gray-700 disabled:opacity-50 hover:bg-gray-600 disabled:hover:bg-gray-700 transition"
                                >
                                    <ChevronLeft size={20} />
                                </button>
                                <span className="text-gray-400">
                                    Page {currentPage} of {Math.ceil(filteredPkgs.length / itemsPerPage)}
                                </span>
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(Math.ceil(filteredPkgs.length / itemsPerPage), p + 1))}
                                    disabled={currentPage === Math.ceil(filteredPkgs.length / itemsPerPage)}
                                    className="p-2 rounded bg-gray-700 disabled:opacity-50 hover:bg-gray-600 disabled:hover:bg-gray-700 transition"
                                >
                                    <ChevronRight size={20} />
                                </button>
                            </div>
                        )}
                    </div>

                    <AnimatePresence>
                        {selectedPackage && (
                            <RightSidebar
                                pkg={selectedPackage}
                                onClose={() => setSelectedPackage(null)}
                                onResolve={handleOpenResolve}
                            />
                        )}
                    </AnimatePresence>
                </div>
            </main>

            {/* Context Menu */}
            {contextMenu.open && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    pkg={contextMenu.pkg}
                    onClose={() => setContextMenu({ ...contextMenu, open: false })}
                    onToggle={togglePackage}
                    onOpenFolder={handleOpenFolder}
                    onDownload={handleDownloadPackage}
                    onCopyPath={handleCopyPath}
                    onCopyFile={handleCopyFile}
                    onCutFile={handleCutFile}
                    onDelete={handleDeleteClick}
                />
            )}
        </div>
    );
}

export default App;
