import { useState, useEffect } from 'react';
import { Package, Search, RefreshCw, ChevronLeft, ChevronRight, X } from 'lucide-react';
import CardGrid from './components/CardGrid';
import Sidebar from './components/Sidebar';
import DragDropOverlay from './components/DragDropOverlay';
import SettingsModal from './components/SettingsModal';
import LoadingToast from './components/LoadingToast';
import MissingDepsModal from './components/MissingDepsModal';
import VersionResolutionModal from './components/VersionResolutionModal';
import ContextMenu from './components/ContextMenu';
import TagSearch from './components/TagSearch';

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
    isFavorite: boolean;
    isHidden: boolean;
    type?: string;
    tags?: string[];
}

function App() {
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
    // const [showHidden, setShowHidden] = useState(false); // Removed for now as we use filter tabs

    // Missing Dependencies Modal State
    const [missingDepsData, setMissingDepsData] = useState<{ open: boolean, pkgName: string, deps: string[] }>({ open: false, pkgName: "", deps: [] });

    // Version Resolution State
    const [resolveData, setResolveData] = useState<{ open: boolean, duplicates: VarPackage[] }>({ open: false, duplicates: [] });

    // Context Menu State
    const [contextMenu, setContextMenu] = useState<{ open: boolean, x: number, y: number, pkg: VarPackage | null }>({ open: false, x: 0, y: 0, pkg: null });

    const handleContextMenu = (e: React.MouseEvent, pkg: VarPackage) => {
        e.preventDefault();
        setContextMenu({
            open: true,
            x: e.clientX,
            y: e.clientY,
            pkg: pkg
        });
    };

    // Filters (Moved to top state)

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
        if (currentFilter === "favorites") res = res.filter(p => p.isFavorite);
        if (currentFilter === "hidden") res = res.filter(p => p.isHidden);

        // Hide hidden packages by default unless looking at Hidden tab
        if (currentFilter !== "hidden") {
            res = res.filter(p => !p.isHidden);
        }

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

    const handleDrop = async (files: string[]) => {
        if (!vamPath) return;
        try {
            // @ts-ignore
            await window.go.main.App.InstallFiles(files, vamPath);
            scanPackages(); // Refresh
        } catch (e) {
            console.error(e);
        }
    };

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

    const toggleFavorite = async (pkg: VarPackage) => {
        try {
            // @ts-ignore
            await window.go.main.App.ToggleFavorite(pkg.fileName);
            setPackages(prev => prev.map(p => p.fileName === pkg.fileName ? { ...p, isFavorite: !p.isFavorite } : p));
        } catch (e) { console.error(e); }
    };

    const toggleHidden = async (pkg: VarPackage) => {
        try {
            // @ts-ignore
            await window.go.main.App.ToggleHidden(pkg.fileName);
            setPackages(prev => prev.map(p => p.fileName === pkg.fileName ? { ...p, isHidden: !p.isHidden } : p));
        } catch (e) { console.error(e); }
    };

    const handleShowMissingDeps = (pkg: VarPackage) => {
        setMissingDepsData({
            open: true,
            pkgName: pkg.meta.packageName || pkg.fileName,
            deps: pkg.missingDeps
        });
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
                    currentPath={vamPath}
                    onSavePath={(path) => {
                        setVamPath(path);
                        localStorage.setItem("vamPath", path);
                        setIsSettingsOpen(false); // Close modal after saving
                    }}
                />
                <div className="text-center space-y-6 max-w-md w-full p-8 bg-gray-800 rounded-xl shadow-2xl border border-gray-700">
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
            <MissingDepsModal
                isOpen={missingDepsData.open}
                onClose={() => setMissingDepsData(prev => ({ ...prev, open: false }))}
                pkgName={missingDepsData.pkgName}
                missingDeps={missingDepsData.deps}
            />
            <VersionResolutionModal
                isOpen={resolveData.open}
                onClose={() => setResolveData(prev => ({ ...prev, open: false }))}
                duplicates={resolveData.duplicates}
                onResolve={handleConfirmResolve}
            />
            <SettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                currentPath={vamPath}
                onSavePath={(path) => {
                    setVamPath(path);
                    localStorage.setItem("vamPath", path);
                    setIsSettingsOpen(false); // Close modal after saving
                }}
            />

            <Sidebar
                packages={packages}
                onFilterCreator={setSelectedCreator}
                currentFilter={currentFilter}
                setFilter={setCurrentFilter}
                selectedCreator={selectedCreator}
                selectedType={selectedType}
                onFilterType={setSelectedType}
                onOpenSettings={() => setIsSettingsOpen(true)}
            />

            <main className="flex-1 flex flex-col overflow-hidden">
                <header className="p-4 bg-gray-800 border-b border-gray-700 flex justify-between items-center shadow-md z-10">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 bg-gray-700 px-3 py-2 rounded-lg w-64">
                            <Search size={18} className="text-gray-400" />
                            <input
                                className="bg-transparent outline-none w-full text-sm"
                                placeholder="Search..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
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

                <div className="flex-1 overflow-auto p-4 custom-scrollbar flex flex-col">
                    <div className="flex-1">
                        <CardGrid
                            packages={filteredPkgs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)}
                            onShowMissing={handleShowMissingDeps}
                            // @ts-ignore
                            onResolve={handleOpenResolve}
                            currentPath={vamPath}
                            totalCount={packages.length}
                            onContextMenu={handleContextMenu}
                        />
                    </div>

                    {filteredPkgs.length > itemsPerPage && (
                        <div className="flex justify-center items-center gap-4 py-4 mt-4 border-t border-gray-700 bg-gray-800/50 backdrop-blur sticky bottom-0">
                            {/* ... pagination buttons ... keep same ... */}
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
            </main>

            {/* Context Menu */}
            {contextMenu.open && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    pkg={contextMenu.pkg}
                    onClose={() => setContextMenu({ ...contextMenu, open: false })}
                    onToggle={togglePackage}
                    onFavorite={toggleFavorite}
                    onHide={toggleHidden}
                />
            )}
        </div>
    );
}

export default App;
