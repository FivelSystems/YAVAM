import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { RefreshCw, Search, X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Package, PanelLeft, LayoutGrid, List, Filter, WifiOff, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import { Toast, ToastItem, ToastType } from './components/Toast';
import DragDropOverlay from './components/DragDropOverlay';
import ContextMenu from './components/ContextMenu';
import LoadingToast from './components/LoadingToast';
import CardGrid from './components/CardGrid';
import Sidebar from './components/Sidebar';

import VersionResolutionModal from './components/VersionResolutionModal';
import SettingsModal from './components/SettingsModal';
import ConfirmationModal from './components/ConfirmationModal';
import RightSidebar from './components/RightSidebar';
import TitleBar from './components/TitleBar';

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

    // Helper to switch library
    const handleSwitchLibrary = (index: number) => {
        if (index < 0 || index >= libraries.length) return;
        setActiveLibIndex(index);
        const path = libraries[index];
        setActiveLibraryPath(path);
        localStorage.setItem("activeLibraryPath", path);
        // Toast?
    };

    const handleAddLibrary = (path: string) => {
        if (!path) return;

        setLibraries(prev => {
            if (prev.includes(path)) {
                // Already exists, just switch to it
                const idx = prev.indexOf(path);
                setActiveLibIndex(idx);
                setActiveLibraryPath(path);
                localStorage.setItem("activeLibraryPath", path);
                return prev;
            }
            const newLibs = [...prev, path];
            localStorage.setItem("savedLibraries", JSON.stringify(newLibs));

            // Switch to new
            setActiveLibIndex(newLibs.length - 1);
            setActiveLibraryPath(path);
            localStorage.setItem("activeLibraryPath", path);
            return newLibs;
        });
    };

    const handleRemoveLibrary = (index: number) => {
        setLibraries(prev => {
            const newLibs = [...prev];
            newLibs.splice(index, 1);
            localStorage.setItem("savedLibraries", JSON.stringify(newLibs));

            // Adjust active index if needed
            if (activeLibIndex >= newLibs.length) {
                setActiveLibIndex(newLibs.length - 1);
                const path = newLibs[newLibs.length - 1] || "";
                setActiveLibraryPath(path);
                localStorage.setItem("activeLibraryPath", path);
            } else if (index === activeLibIndex) {
                // Removed current, switching to same index (which is now next item) or prev?
                // Actually if I remove index 0, the new index 0 is valid.
                const path = newLibs[activeLibIndex] || "";
                setActiveLibraryPath(path);
                localStorage.setItem("activeLibraryPath", path);
            } else if (index < activeLibIndex) {
                // Removed item before current, shift index down
                setActiveLibIndex(prevIdx => prevIdx - 1);
            }

            return newLibs;
        });
    };

    const handleBrowseAndAdd = async () => {
        // @ts-ignore
        if (window.go) {
            try {
                // @ts-ignore
                const p = await window.go.main.App.SelectDirectory();
                if (p) handleAddLibrary(p);
            } catch (e) {
                console.error(e);
            }
        }
    };

    const [selectedPackage, setSelectedPackage] = useState<VarPackage | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Library Management
    const [libraries, setLibraries] = useState<string[]>(() => {
        const saved = localStorage.getItem("savedLibraries");
        const initial = saved ? JSON.parse(saved) : [];
        const current = localStorage.getItem("activeLibraryPath");
        if (current && !initial.includes(current)) {
            return [current, ...initial];
        }
        return initial.length > 0 ? initial : [];
    });

    // Determine active index based on current vamPath or default to 0
    const [activeLibIndex, setActiveLibIndex] = useState(() => {
        const current = localStorage.getItem("activeLibraryPath");
        const saved = localStorage.getItem("savedLibraries");
        const libs = saved ? JSON.parse(saved) : [];
        if (current) {
            const idx = libs.indexOf(current);
            if (idx !== -1) return idx;
            // If current path isn't in list (e.g. freshly added/legacy), logic above adds it to front? 
            // Logic above in libraries init uses logic to include it.
            // But useState initializers run once. 
            // Let's rely on effect to sync?
            return 0;
        }
        return 0;
    });

    // Derived vamPath (source of truth is libraries[activeLibIndex])
    // But we also need to support the case where no libraries exist yet.
    // So we use a state for vamPath that syncs, or just use derived?
    // Existing logic relies on `activeLibraryPath` state.
    const [activeLibraryPath, setActiveLibraryPath] = useState<string>(() => {
        const current = localStorage.getItem("activeLibraryPath");
        if (current) return current;
        // Fallback to first library if available
        const saved = localStorage.getItem("savedLibraries");
        const libs = saved ? JSON.parse(saved) : [];
        return libs.length > 0 ? libs[0] : "";
    });

    const [packages, setPackages] = useState<VarPackage[]>([]);
    const [filteredPkgs, setFilteredPkgs] = useState<VarPackage[]>([]);
    const [availableTags, setAvailableTags] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    // Filter State
    const [searchQuery, setSearchQuery] = useState("");
    const [tagSearchQuery, setTagSearchQuery] = useState("");
    const [isTagSearchOpen, setIsTagSearchOpen] = useState(false);
    const [isTagsVisible, setIsTagsVisible] = useState(true);
    const [currentFilter, setCurrentFilter] = useState("all");
    const [selectedCreator, setSelectedCreator] = useState<string | null>(null);
    const [selectedType, setSelectedType] = useState<string | null>(null);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(() => parseInt(localStorage.getItem('itemsPerPage') || '25'));
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const addToast = (message: string, type: ToastType = 'info') => {
        const id = Date.now().toString(36) + Math.random().toString(36).substr(2);
        setToasts(prev => [...prev, { id, message, type }]);
    };

    const removeToast = (id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };


    // Reset pagination when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, tagSearchQuery, currentFilter, selectedCreator, selectedType, selectedTags.length, itemsPerPage]);

    const handleSetItemsPerPage = (val: number) => {
        setItemsPerPage(val);
        localStorage.setItem('itemsPerPage', val.toString());
    };

    // Settings
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 768);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>(window.innerWidth < 768 ? 'list' : 'grid');
    const [gridSize, setGridSize] = useState(parseInt(localStorage.getItem("gridSize") || "150"));

    useEffect(() => {
        const handleResize = () => {
            // ... existing resize logic
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
        // ...
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);



    // Version Resolution State
    const [resolveData, setResolveData] = useState<{ open: boolean, duplicates: VarPackage[] }>({ open: false, duplicates: [] });

    // Context Menu State
    const [contextMenu, setContextMenu] = useState<{ open: boolean, x: number, y: number, pkg: VarPackage | null }>({ open: false, x: 0, y: 0, pkg: null });

    // Delete Confirmation State
    const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean, pkg: VarPackage | null }>({ open: false, pkg: null });

    // Collision Confirmation State
    const [collisionData, setCollisionData] = useState<{ open: boolean, pkg: VarPackage | null }>({ open: false, pkg: null });

    // Install Modal State
    const [installModal, setInstallModal] = useState<{ open: boolean, pkgs: VarPackage[] }>({ open: false, pkgs: [] });
    // Install Collision
    const [installCollision, setInstallCollision] = useState<{ open: boolean, collisions: string[], libPath: string, pkgs: VarPackage[] }>({ open: false, collisions: [], libPath: "", pkgs: [] });
    // Details Panel Visibility
    const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState(false);

    const handlePackageClick = (pkg: VarPackage, e?: React.MouseEvent) => {
        if (e && (e.ctrlKey || e.metaKey)) {
            // Multi-select toggle
            setSelectedIds(prev => {
                const newSet = new Set(prev);
                if (newSet.has(pkg.filePath)) newSet.delete(pkg.filePath);
                else newSet.add(pkg.filePath);
                return newSet;
            });
            // Update anchor, but DO NOT open details panel
            setSelectedPackage(pkg);
            setIsDetailsPanelOpen(false);
        } else if (e && e.shiftKey && selectedPackage) {
            // Shift select (range)
            const start = filteredPkgs.findIndex(p => p.filePath === selectedPackage.filePath);
            const end = filteredPkgs.findIndex(p => p.filePath === pkg.filePath);
            if (start !== -1 && end !== -1) {
                const min = Math.min(start, end);
                const max = Math.max(start, end);
                const range = filteredPkgs.slice(min, max + 1).map(p => p.filePath);
                setSelectedIds(prev => {
                    const newSet = new Set(prev);
                    range.forEach(id => newSet.add(id));
                    return newSet;
                });
            }
            setSelectedPackage(pkg);
            setIsDetailsPanelOpen(false);
        } else {
            // Single select
            if (selectedPackage?.filePath === pkg.filePath && selectedIds.size === 1) {
                // Toggle off / Deselect
                setSelectedPackage(null);
                setSelectedIds(new Set());
                setIsDetailsPanelOpen(false);
            } else {
                setSelectedPackage(pkg);
                setSelectedIds(new Set([pkg.filePath]));
                setIsDetailsPanelOpen(true);
            }
        }
    };

    const handleContextMenu = (e: React.MouseEvent, pkg: VarPackage) => {
        e.preventDefault();
        // If pkg is NOT in selectedIds, select it (exclusive)
        if (!selectedIds.has(pkg.filePath)) {
            setSelectedPackage(pkg);
            setSelectedIds(new Set([pkg.filePath]));
        }
        setContextMenu({
            open: true,
            x: e.clientX,
            y: e.clientY,
            pkg: pkg // Context menu usually operates on "clicked" item, but if selection exists, it might operate on selection.
            // We pass 'pkg' as the anchor, but actions should check selectedIds
        });
    };

    // Server State
    const [serverEnabled, setServerEnabled] = useState(false);
    const [serverPort, setServerPort] = useState("18888");
    const [localIP, setLocalIP] = useState("Loading...");
    const [serverLogs, setServerLogs] = useState<string[]>([]);

    useEffect(() => {
        // @ts-ignore
        if (window.go && window.runtime) {
            // @ts-ignore
            window.go.main.App.GetLocalIP().then(ip => setLocalIP(ip));
            // @ts-ignore
            window.runtime.EventsOn("server:log", (msg: string) => {
                setServerLogs(prev => [...prev, msg].slice(-100));
            });
        } else {
            // Web Mode: Fetch config
            fetch('/api/config')
                .then(res => res.json())
                .then(data => {
                    setLocalIP("Remote/Web Mode");
                    if (data.libraries && Array.isArray(data.libraries)) {
                        setLibraries(data.libraries);
                    }
                    if (data.path && !activeLibraryPath) {
                        // Only set if we don't have one selected? 
                        // actually we should trust server config on initial load if local state is empty
                        setActiveLibraryPath(data.path);
                    }
                })
                .catch(err => console.error("Failed to fetch server config", err));
        }

        return () => {
            // @ts-ignore
            if (window.runtime) {
                // @ts-ignore
                window.runtime.EventsOff("server:log");
            }
        };
    }, []);

    const handleToggleServer = async () => {
        // @ts-ignore
        if (window.go) {
            if (serverEnabled) {
                // @ts-ignore
                await window.go.main.App.StopServer();
                setServerEnabled(false);
            } else {
                try {
                    // @ts-ignore
                    await window.go.main.App.StartServer(serverPort, activeLibraryPath, libraries);
                    setServerEnabled(true);
                } catch (e) {
                    alert("Failed to start server: " + e);
                }
            }
        }
    };


    // Filters

    // Web Mode Detection
    useEffect(() => {
        // @ts-ignore
        if (!window.go) {
            fetch('/api/config')
                .then(r => r.json())
                .then(cfg => {
                    if (cfg.path) {
                        setActiveLibraryPath(cfg.path);
                        localStorage.setItem('activeLibraryPath', cfg.path);
                    }
                })
                .catch(() => console.log("Not in web mode or server offline"));
        } else {
            // Desktop Mode: Sync preferences
            const minClose = localStorage.getItem('minimizeOnClose') === 'true';
            // @ts-ignore
            if (minClose && window.go?.main?.App?.SetMinimizeOnClose) {
                // @ts-ignore
                window.go.main.App.SetMinimizeOnClose(true);
            }
        }
    }, []);

    useEffect(() => {
        if (activeLibraryPath) {
            scanPackages();
        }
    }, [activeLibraryPath]);

    // Sync libraries to server if running
    useEffect(() => {
        // @ts-ignore
        if (window.go && serverEnabled) {
            // @ts-ignore
            window.go.main.App.UpdateServerLibraries(libraries).catch(e => console.error(e));
        }
    }, [libraries, serverEnabled]);

    useEffect(() => {
        filterPackages();
        setCurrentPage(1);
    }, [packages, searchQuery, currentFilter, selectedCreator, selectedType, selectedTags]);

    const scanPackages = async () => {
        if (!activeLibraryPath) return;
        setLoading(true);
        try {
            // @ts-ignore
            if (window.go) {
                // @ts-ignore
                const res = await window.go.main.App.ScanPackages(activeLibraryPath);
                setPackages(res.packages || []);
                setAvailableTags(res.tags || []);
            } else {
                // Web Mode
                const pkgs = await fetch(`/api/packages?path=${encodeURIComponent(activeLibraryPath)}`).then(r => r.json());
                setPackages(pkgs || []);
                // Extract tags from pkgs if backend doesn't send them separately (my /api/packages endpoint sends [Package] list currently, not ScanResult)
                // Wait, my endpoint sends res.Packages which is []VarPackage.
                // It does NOT send tags separately.
                // I should ideally update endpoint or extract tags here.
                // Let's extract tags here for now to be safe.
                const tags = new Set<string>();
                pkgs?.forEach((p: any) => p.tags?.forEach((t: string) => tags.add(t)));
                setAvailableTags(Array.from(tags));
            }
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
        if (!activeLibraryPath) return;
        try {
            // @ts-ignore
            await window.go.main.App.InstallFiles(files, activeLibraryPath);
            scanPackages(); // Refresh
        } catch (e) {
            console.error(e);
            alert(e);
        }
    }, [activeLibraryPath]);

    const handleWebUpload = async (files: FileList) => {
        if (!files || files.length === 0) return;
        setLoading(true);
        const formData = new FormData();
        formData.append('path', activeLibraryPath || "");
        for (let i = 0; i < files.length; i++) {
            formData.append("file", files[i]);
        }

        try {
            const res = await fetch("/api/upload", {
                method: "POST",
                body: formData
            });
            if (!res.ok) throw new Error("Upload failed");
            // Trigger Scan
            scanPackages();
        } catch (e) {
            console.error(e);
            addToast("Upload failed: " + e, 'error');
        } finally {
            setLoading(false);
        }
    };

    const recalculateDuplicates = (currentPkgs: VarPackage[]): VarPackage[] => {
        // ...

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

    const togglePackage = async (pkg: VarPackage, merge = false) => {
        try {
            let newPath = "";
            // @ts-ignore
            if (window.go) {
                // @ts-ignore
                newPath = await window.go.main.App.TogglePackage(pkg.filePath, !pkg.isEnabled, activeLibraryPath, merge);
            } else {
                // Web Mode
                const res = await fetch('/api/toggle', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filePath: pkg.filePath, enable: !pkg.isEnabled, merge: merge })
                }).then(r => r.json());

                if (!res.success) throw new Error(res.message || res.error || "Unknown error");
                newPath = res.newPath;
            }

            addToast(pkg.isEnabled ? "Package disabled" : "Package enabled", 'success');

            // Optimistic update with path correction
            setPackages(prev => {
                const updated = prev.map(p =>
                    p.filePath === pkg.filePath ? { ...p, isEnabled: !p.isEnabled, filePath: newPath } : p
                );
                return recalculateDuplicates(updated);
            });
        } catch (e: any) {
            console.error(e);
            const errStr = e.toString();
            // Check for collision
            if (errStr.includes("destination file already exists") || errStr.includes("already active") || errStr.includes("already exists")) {
                setCollisionData({ open: true, pkg });
                return;
            }

            addToast("Failed to toggle: " + e, 'error');
        }
    };

    const handleConfirmCollision = () => {
        if (collisionData.pkg) {
            togglePackage(collisionData.pkg, true); // Retry with merge
            setCollisionData({ open: false, pkg: null });
        }
    };

    // Context Menu Handlers
    const handleOpenFolder = async (pkg: VarPackage) => {
        // @ts-ignore
        if (!window.go) return addToast("Not available in web mode", 'error');
        try {
            // @ts-ignore
            await window.go.main.App.OpenFolderInExplorer(pkg.filePath);
        } catch (e) { console.error(e); }
    };

    // Updated to use Copy Path
    const handleCopyPath = async (pkg: VarPackage) => {
        try {
            await navigator.clipboard.writeText(pkg.filePath);
            addToast("Path copied to clipboard", 'success');
        } catch (e) { console.error(e); }
    };

    const handleCopyFile = async (pkg: VarPackage) => {
        // @ts-ignore
        if (!window.go) return addToast("Not available in web mode", 'error');
        try {
            // @ts-ignore
            await window.go.main.App.CopyFileToClipboard(pkg.filePath);
            addToast("File copied to clipboard", 'success');
        } catch (e) { console.error(e); }
    };

    const handleCutFile = async (pkg: VarPackage) => {
        // @ts-ignore
        if (!window.go) return addToast("Not available in web mode", 'error');
        try {
            // @ts-ignore
            await window.go.main.App.CutFileToClipboard(pkg.filePath);
            addToast("File cut to clipboard", 'success');
        } catch (e) { console.error(e); }
    };


    const handleDeleteClick = (pkg: VarPackage) => {
        setDeleteConfirm({ open: true, pkg });
    };

    // ...



    const handleConfirmDelete = async () => {
        if (deleteConfirm.pkg) {
            try {
                // @ts-ignore
                if (window.go) {
                    // @ts-ignore
                    await window.go.main.App.DeleteFileToRecycleBin(deleteConfirm.pkg.filePath);
                } else {
                    const res = await fetch('/api/delete', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ filePath: deleteConfirm.pkg.filePath })
                    }).then(r => r.json());
                    if (!res.success) throw new Error("Delete failed");
                }
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
        const others = resolveData.duplicates.filter(p => p.filePath !== keepPkg.filePath).map(p => p.filePath);
        setResolveData({ open: false, duplicates: [] }); // Close immediately, optimistic UI

        try {
            // @ts-ignore
            if (window.go) {
                // @ts-ignore
                const res = await window.go.main.App.ResolveConflicts(keepPkg.filePath, others, activeLibraryPath);

                let msg = "Conflicts resolved";
                if (res.merged > 0) msg += `, ${res.merged} merged`;
                if (res.disabled > 0) msg += `, ${res.disabled} disabled`;

                addToast(msg, 'success');
                scanPackages(); // Refresh to show new state/paths
            } else {
                // Web Mode
                const res = await fetch('/api/resolve', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        keepPath: keepPkg.filePath,
                        others: others,
                        libraryPath: activeLibraryPath
                    })
                }).then(r => r.json());

                if (res.error || res.success === false) {
                    throw new Error(res.message || "Unknown error");
                }

                let msg = "Conflicts resolved";
                if (res.merged > 0) msg += `, ${res.merged} merged`;
                if (res.disabled > 0) msg += `, ${res.disabled} disabled`;
                addToast(msg, 'success');
            }
            scanPackages(); // Refresh to show new state/paths
        } catch (e) {
            console.error(e);
            addToast("Failed to resolve: " + e, 'error');
        }
    };

    if (!activeLibraryPath) {
        // @ts-ignore
        if (!window.go) {
            return (
                <div className="flex h-screen items-center justify-center bg-gray-900 text-white flex-col p-8 text-center space-y-6">
                    <div className="bg-red-500/10 p-6 rounded-full animate-pulse">
                        <WifiOff size={48} className="text-red-500" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold mb-2">Waiting for Host Configuration</h1>
                        <p className="text-gray-400 max-w-md mx-auto">
                            The host application has not configured a library folder yet.
                            Please return to the host machine and select a Repository folder.
                        </p>
                    </div>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2 mx-auto"
                    >
                        <RefreshCw size={18} /> Retry Connection
                    </button>
                </div>
            );
        }

        return (
            <div className="flex h-screen items-center justify-center bg-gray-900 text-white">
                <SettingsModal
                    isOpen={isSettingsOpen}
                    onClose={() => setIsSettingsOpen(false)}
                    gridSize={gridSize}
                    setGridSize={(size) => {
                        setGridSize(size);
                        localStorage.setItem("gridSize", size.toString());
                    }}
                    itemsPerPage={itemsPerPage}
                    setItemsPerPage={handleSetItemsPerPage}
                    // Server Props
                    serverEnabled={serverEnabled}
                    onToggleServer={handleToggleServer}
                    serverPort={serverPort}
                    setServerPort={setServerPort}
                    localIP={localIP}
                    logs={serverLogs}
                    setLogs={setServerLogs}
                    isWeb={!window.go}
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
                            value={activeLibraryPath}
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
                                        handleAddLibrary(p);
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
        <div className="flex flex-col h-screen bg-gray-900 text-white overflow-hidden">
            <TitleBar />
            <div className="flex-1 flex overflow-hidden relative">
                <DragDropOverlay onDrop={handleDrop} onWebUpload={handleWebUpload} />
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
                    gridSize={gridSize}
                    setGridSize={(size) => {
                        setGridSize(size);
                        localStorage.setItem("gridSize", size.toString());
                    }}
                    itemsPerPage={itemsPerPage}
                    setItemsPerPage={handleSetItemsPerPage}
                    // Server Props
                    serverEnabled={serverEnabled}
                    onToggleServer={handleToggleServer}
                    serverPort={serverPort}
                    setServerPort={setServerPort}
                    localIP={localIP}
                    logs={serverLogs}
                    setLogs={setServerLogs}
                    isWeb={!window.go}
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

                <ConfirmationModal
                    isOpen={collisionData.open}
                    onClose={() => setCollisionData({ open: false, pkg: null })}
                    onConfirm={handleConfirmCollision}
                    title="Package Collision"
                    message={`A package with the same name already exists in the destination. Since versions match, would you like to merge/overwrite it?`}
                    confirmText="Merge & Overwrite"
                    confirmStyle="primary"
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
                    "z-40 transition-all duration-300 ease-in-out bg-gray-800 shrink-0 border-t border-gray-700",
                    "md:relative md:h-full",
                    "fixed left-0 top-8 bottom-0 shadow-2xl md:shadow-none md:top-0 md:bottom-auto",
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

                            // Library Switcher Props
                            libraries={libraries}
                            currentLibIndex={activeLibIndex}
                            onSelectLibrary={(index) => handleSwitchLibrary(index)}
                            // Only allow management on Desktop
                            // @ts-ignore
                            onAddLibrary={window.go ? handleBrowseAndAdd : undefined}
                            // @ts-ignore
                            onRemoveLibrary={window.go ? handleRemoveLibrary : undefined}
                        />
                    </div>
                </div>

                <main className="flex-1 flex flex-col overflow-hidden w-full">
                    <header className="flex flex-col bg-gray-800 border-b border-gray-700 shadow-md z-10 shrink-0">
                        <div className="flex justify-between items-center p-4">
                            <div className="flex items-center gap-3 flex-1 min-w-0 mr-8">
                                <button
                                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                                    className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors shrink-0"
                                    title="Toggle Sidebar"
                                >
                                    <PanelLeft size={20} />
                                </button>

                                <div className="flex items-center gap-2 bg-gray-700 px-3 py-2 rounded-lg max-w-md w-full">
                                    <Search size={18} className="text-gray-400 shrink-0" />
                                    <input
                                        className="bg-transparent outline-none w-full text-sm"
                                        placeholder="Search packages..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* Right Group: View Mode & Status */}
                            <div className="flex items-center gap-4 shrink-0">
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

                                <div className="flex items-center gap-4 text-sm text-gray-400">
                                    <span className="hidden sm:inline">{filteredPkgs.length} packages found</span>
                                    <button
                                        onClick={scanPackages}
                                        className="hover:text-white transition-colors"
                                        title="Refresh Packages"
                                    >
                                        <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
                                    </button>
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

                    <div className="flex-1 flex overflow-hidden">
                        <div className="flex-1 flex flex-col overflow-hidden relative min-w-0">
                            <div className="flex-1 overflow-auto p-4 custom-scrollbar">
                                <CardGrid
                                    packages={filteredPkgs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)}
                                    currentPath={activeLibraryPath}
                                    totalCount={packages.length}
                                    onContextMenu={handleContextMenu}
                                    onSelect={handlePackageClick}
                                    selectedPkgId={selectedIds.size === 1 ? selectedPackage?.filePath : undefined}
                                    selectedIds={selectedIds}
                                    viewMode={viewMode}
                                    gridSize={gridSize}
                                />
                            </div>

                            {/* Pagination Footer */}
                            {filteredPkgs.length > itemsPerPage && (
                                <div className="p-3 border-t border-gray-700 bg-gray-800 shadow-xl z-20 flex justify-center items-center gap-2 shrink-0 overflow-x-auto">
                                    {/* First Page */}
                                    <button
                                        onClick={() => setCurrentPage(1)}
                                        disabled={currentPage === 1}
                                        className="p-1.5 rounded-lg bg-gray-700 disabled:opacity-30 hover:bg-gray-600 disabled:hover:bg-gray-700 transition-colors text-gray-300"
                                        title="First Page"
                                    >
                                        <ChevronsLeft size={18} />
                                    </button>
                                    {/* Previous Page */}
                                    <button
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        disabled={currentPage === 1}
                                        className="p-1.5 rounded-lg bg-gray-700 disabled:opacity-30 hover:bg-gray-600 disabled:hover:bg-gray-700 transition-colors text-gray-300"
                                        title="Previous Page"
                                    >
                                        <ChevronLeft size={18} />
                                    </button>

                                    {/* Page Numbers */}
                                    <div className="flex items-center gap-1 mx-2">
                                        {(() => {
                                            const totalPages = Math.ceil(filteredPkgs.length / itemsPerPage);
                                            const maxVisible = 5;
                                            let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
                                            let endPage = Math.min(totalPages, startPage + maxVisible - 1);

                                            if (endPage - startPage + 1 < maxVisible) {
                                                startPage = Math.max(1, endPage - maxVisible + 1);
                                            }

                                            const pages = [];
                                            if (startPage > 1) {
                                                pages.push(
                                                    <button key={1} onClick={() => setCurrentPage(1)} className="w-8 h-8 rounded-lg bg-gray-700 hover:bg-gray-600 text-xs font-medium text-gray-400">1</button>
                                                );
                                                if (startPage > 2) pages.push(<span key="dots1" className="text-gray-600">...</span>);
                                            }

                                            for (let i = startPage; i <= endPage; i++) {
                                                pages.push(
                                                    <button
                                                        key={i}
                                                        onClick={() => setCurrentPage(i)}
                                                        className={clsx(
                                                            "w-8 h-8 rounded-lg text-xs font-medium transition-colors",
                                                            currentPage === i
                                                                ? "bg-blue-600 text-white shadow-lg shadow-blue-900/50"
                                                                : "bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white"
                                                        )}
                                                    >
                                                        {i}
                                                    </button>
                                                );
                                            }

                                            if (endPage < totalPages) {
                                                if (endPage < totalPages - 1) pages.push(<span key="dots2" className="text-gray-600">...</span>);
                                                pages.push(
                                                    <button key={totalPages} onClick={() => setCurrentPage(totalPages)} className="w-8 h-8 rounded-lg bg-gray-700 hover:bg-gray-600 text-xs font-medium text-gray-400">{totalPages}</button>
                                                );
                                            }
                                            return pages;
                                        })()}
                                    </div>

                                    {/* Next Page */}
                                    <button
                                        onClick={() => setCurrentPage(p => Math.min(Math.ceil(filteredPkgs.length / itemsPerPage), p + 1))}
                                        disabled={currentPage === Math.ceil(filteredPkgs.length / itemsPerPage)}
                                        className="p-1.5 rounded-lg bg-gray-700 disabled:opacity-30 hover:bg-gray-600 disabled:hover:bg-gray-700 transition-colors text-gray-300"
                                        title="Next Page"
                                    >
                                        <ChevronRight size={18} />
                                    </button>
                                    {/* Last Page */}
                                    <button
                                        onClick={() => setCurrentPage(Math.ceil(filteredPkgs.length / itemsPerPage))}
                                        disabled={currentPage === Math.ceil(filteredPkgs.length / itemsPerPage)}
                                        className="p-1.5 rounded-lg bg-gray-700 disabled:opacity-30 hover:bg-gray-600 disabled:hover:bg-gray-700 transition-colors text-gray-300"
                                        title="Last Page"
                                    >
                                        <ChevronsRight size={18} />
                                    </button>
                                </div>
                            )}
                        </div>

                        <AnimatePresence>
                            {(selectedPackage && selectedIds.size === 1 && isDetailsPanelOpen) && (
                                <RightSidebar
                                    pkg={selectedPackage}
                                    onClose={() => { setIsDetailsPanelOpen(false); setSelectedPackage(null); setSelectedIds(new Set()); }}
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
                        selectedCount={selectedIds.size}
                        onClose={() => setContextMenu({ ...contextMenu, open: false })}
                        onToggle={(pkg) => selectedIds.has(pkg.filePath) && selectedIds.size > 1 ? Array.from(selectedIds).forEach(id => { const p = packages.find(pk => pk.filePath === id); if (p) togglePackage(p) }) : togglePackage(pkg)}
                        onOpenFolder={handleOpenFolder}
                        onDownload={(pkg) => {
                            // Install Logic
                            // If multiple selected, install all.
                            const targets = selectedIds.size > 1 ? packages.filter(p => selectedIds.has(p.filePath)) : [pkg];
                            setInstallModal({ open: true, pkgs: targets });
                        }}
                        onCopyPath={handleCopyPath}
                        onCopyFile={handleCopyFile}
                        onCutFile={handleCutFile}
                        onDelete={handleDeleteClick}
                    />
                )}
            </div>
            {/* Install Modal */}
            <AnimatePresence>
                {installModal.open && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                        <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl p-6 w-full max-w-sm">
                            <h2 className="text-xl font-bold text-white mb-4">Install to Library</h2>
                            <p className="text-gray-400 mb-4">Select the destination library for {installModal.pkgs.length} package(s):</p>
                            <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar mb-4">
                                {libraries.filter(l => l !== activeLibraryPath).map(lib => (
                                    <button
                                        key={lib}
                                        onClick={async () => {
                                            // Trigger Install
                                            // @ts-ignore
                                            if (window.go) {
                                                try {
                                                    const paths = installModal.pkgs.map(p => p.filePath);
                                                    // @ts-ignore
                                                    // Try copy without overwrite first
                                                    const collisions = await window.go.main.App.CopyPackagesToLibrary(paths, lib, false);

                                                    if (collisions && collisions.length > 0) {
                                                        // Close install modal and show collision modal
                                                        setInstallModal({ open: false, pkgs: [] });
                                                        setInstallCollision({ open: true, collisions: collisions, libPath: lib, pkgs: installModal.pkgs });
                                                        return;
                                                    }

                                                    addToast(`Installed ${paths.length} packages to ${lib.split(/[/\\]/).pop()}`, 'success');
                                                    setInstallModal({ open: false, pkgs: [] });
                                                } catch (e) {
                                                    addToast("Install failed: " + e, 'error');
                                                }
                                            }
                                        }}
                                        className="w-full text-left px-3 py-2 rounded bg-gray-700 hover:bg-blue-600 text-gray-200 hover:text-white transition-colors truncate"
                                        title={lib}
                                    >
                                        {lib.split(/[/\\]/).pop()}
                                    </button>
                                ))}
                                {libraries.length <= 1 && <div className="text-gray-500 text-sm italic p-2 text-center">No other libraries configured.</div>}
                            </div>
                            <button onClick={() => setInstallModal({ open: false, pkgs: [] })} className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg">Cancel</button>
                        </div>
                    </div>
                )}
                {/* Install Collision Modal */}
                {installCollision.open && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                        <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl p-6 w-full max-w-sm">
                            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><div className="text-yellow-500"><AlertTriangle size={24} /></div> Warning</h2>
                            <p className="text-gray-300 mb-2">The following packages already exist in the destination library:</p>
                            <div className="bg-gray-900 rounded p-2 mb-4 max-h-32 overflow-y-auto text-xs font-mono text-gray-400">
                                {installCollision.collisions.map(c => <div key={c}>{c}</div>)}
                            </div>
                            <p className="text-gray-400 mb-6 text-sm">Do you want to overwrite them?</p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setInstallCollision({ open: false, collisions: [], libPath: "", pkgs: [] })}
                                    className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={async () => {
                                        // Overwrite logic
                                        try {
                                            const paths = installCollision.pkgs.map(p => p.filePath);
                                            // @ts-ignore
                                            await window.go.main.App.CopyPackagesToLibrary(paths, installCollision.libPath, true);
                                            addToast(`Installed/Overwrote ${paths.length} packages`, 'success');
                                            setInstallCollision({ open: false, collisions: [], libPath: "", pkgs: [] });
                                        } catch (e) {
                                            addToast("Install failed: " + e, 'error');
                                        }
                                    }}
                                    className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg"
                                >
                                    Overwrite
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </AnimatePresence>

            {/* Toasts Container */}
            <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end pointer-events-none">
                <AnimatePresence>
                    {toasts.map(toast => (
                        <Toast key={toast.id} toast={toast} onRemove={removeToast} />
                    ))}
                </AnimatePresence>
            </div>
        </div>
    );
}

export default App;
