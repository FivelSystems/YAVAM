import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { RefreshCw, Search, X, PanelLeft, LayoutGrid, List, Filter, WifiOff, AlertTriangle, ArrowUpDown, Calendar, ArrowUpAZ, ArrowDownZA, ArrowDownWideNarrow, ArrowUpNarrowWide } from 'lucide-react';
import clsx from 'clsx';
import { Toast, ToastItem, ToastType } from './components/Toast';
import DragDropOverlay from './components/DragDropOverlay';
import ContextMenu from './components/ContextMenu';

import CardGrid from './components/CardGrid';
import Sidebar from './components/Sidebar';

import VersionResolutionModal from './components/VersionResolutionModal';
import SettingsModal from './components/SettingsModal';
import ConfirmationModal from './components/ConfirmationModal';
import RightSidebar from './components/RightSidebar';
import TitleBar from './components/TitleBar';
import SetupWizard from './components/SetupWizard';
import { UpgradeModal } from "./components/UpgradeModal";
import { Pagination } from './components/Pagination';
import { ScanProgressBar } from './components/ScanProgressBar';

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
    categories: string[];
    tags?: string[];
}

function App() {
    // Setup State
    const [needsSetup, setNeedsSetup] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);

    // Update State
    const [updateInfo, setUpdateInfo] = useState<any>(null);
    const [showUpdateModal, setShowUpdateModal] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);

    const hasCheckedUpdates = useRef(false);

    useEffect(() => {
        // Prevent double-check in Strict Mode
        if (hasCheckedUpdates.current) return;
        hasCheckedUpdates.current = true;

        // @ts-ignore
        if (window.go && window.go.main && window.go.main.App) {
            // @ts-ignore
            window.go.main.App.IsConfigured().then((configured: boolean) => {
                if (!configured) setNeedsSetup(true);
            });

            // Auto Update Check
            setTimeout(async () => {
                try {
                    // @ts-ignore
                    const info = await window.go.main.App.CheckForUpdates();
                    if (info) {
                        setUpdateInfo(info);
                        setShowUpdateModal(true);
                    } else {
                        addToast("You are using the latest version", "success");
                    }
                } catch (e) {
                    console.error("Failed to check updates:", e);
                }
            }, 3000);
        } else {
            // Web Mode Update Check
            setTimeout(async () => {
                try {
                    const res = await fetch("/api/version/check");
                    if (res.ok) {
                        // Check content length or if empty?
                        const text = await res.text();
                        if (text) {
                            const info = JSON.parse(text);
                            if (info) {
                                addToast(`New Version ${info.version} Available!`, 'info');
                            } else {
                                addToast("You are using the latest version", "success");
                            }
                        } else {
                            // Empty response means no update (based on my server implementation returning null?)
                            // My server returns object or null. JSON encoder of nil is "null".
                            addToast("You are using the latest version", "success");
                        }
                    }
                } catch (e) {
                    console.error("Web update check failed:", e);
                }
            }, 3000);
        }
    }, []);

    const handleUpdate = async () => {
        if (!updateInfo) return;
        setIsUpdating(true);
        try {
            // @ts-ignore
            await window.go.main.App.ApplyUpdate(updateInfo.downloadUrl);
            // Restart
            // @ts-ignore
            await window.go.main.App.RestartApp();
        } catch (e: any) {
            console.error("Update failed:", e);
            setIsUpdating(false);
            addToast("Update failed: " + e, 'error');
            setShowUpdateModal(false);
        }
    };

    // ... (SSE Listener unchanged) ...

    // New Handler for Sidebar Selection

    // Helper to switch library
    const handleSwitchLibrary = async (index: number) => {
        if (index < 0 || index >= libraries.length) return;
        if (index === activeLibIndexRef.current) return; // Prevent reload if already active (checks live value)

        if (loading) {
            setIsCancelling(true);
            try {
                // @ts-ignore
                if (window.go) await window.go.main.App.CancelScan();
                else await fetch('/api/scan/cancel');
            } catch (e) {
                console.error("Cancel failed", e);
            } finally {
                setIsCancelling(false);
            }
        }

        setPackages([]);
        setLoading(false);
        setScanProgress({ current: 0, total: 0 });
        setCurrentPage(1);

        setActiveLibIndex(index);
        const path = libraries[index];
        setActiveLibraryPath(path);
        localStorage.setItem("activeLibraryPath", path);
    };

    const handleAddLibrary = (path: string) => {
        if (!path) return;

        if (libraries.includes(path)) {
            setActiveLibraryPath(path);
            localStorage.setItem("activeLibraryPath", path);
            return;
        }

        const newLibs = [...libraries, path];
        setLibraries(newLibs);
        localStorage.setItem("savedLibraries", JSON.stringify(newLibs));

        setActiveLibraryPath(path);
        localStorage.setItem("activeLibraryPath", path);

        // Sync Backend
        // @ts-ignore
        if (window.go && window.go.main && window.go.main.App) {
            // @ts-ignore
            window.go.main.App.AddConfiguredLibrary(path);
        }
    };

    const handleRemoveLibrary = (path: string) => {
        setLibraries(prev => {
            const index = prev.indexOf(path);
            if (index === -1) return prev;

            const newLibs = [...prev];
            newLibs.splice(index, 1);
            localStorage.setItem("savedLibraries", JSON.stringify(newLibs));

            if (activeLibIndex >= newLibs.length) {
                const newIdx = Math.max(0, newLibs.length - 1);
                setActiveLibIndex(newIdx);
                const newPath = newLibs[newIdx] || "";
                setActiveLibraryPath(newPath);
                localStorage.setItem("activeLibraryPath", newPath);
            } else if (index === activeLibIndex) {
                const newPath = newLibs[activeLibIndex] || "";
                setActiveLibraryPath(newPath);
                localStorage.setItem("activeLibraryPath", newPath);
            } else if (index < activeLibIndex) {
                setActiveLibIndex(prevIdx => prevIdx - 1);
            }

            // @ts-ignore
            if (window.go && window.go.main && window.go.main.App) {
                // @ts-ignore
                window.go.main.App.RemoveConfiguredLibrary(path);
            }

            return newLibs;
        });
    };

    const handleReorderLibraries = (newOrder: string[]) => {
        setLibraries(newOrder);
        // @ts-ignore
        if (window.go && window.go.main && window.go.main.App) {
            // @ts-ignore
            window.go.main.App.ReorderConfiguredLibraries(newOrder);
        }
        const newIdx = newOrder.indexOf(activeLibraryPath);
        if (newIdx !== -1) {
            setActiveLibIndex(newIdx);
        }
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
    const [libraries, setLibraries] = useState<string[]>([]);

    // Fetch and Migrate Libraries
    useEffect(() => {
        // @ts-ignore
        if (window.go) {
            // @ts-ignore
            window.go.main.App.GetConfiguredLibraries().then(async (serverLibs: string[]) => {
                const saved = localStorage.getItem("savedLibraries");
                const localLibs = saved ? JSON.parse(saved) : [];

                if (serverLibs.length === 0 && localLibs.length > 0) {
                    console.log("Migrating libraries to backend storage...");
                    for (const lib of localLibs) {
                        // @ts-ignore
                        await window.go.main.App.AddConfiguredLibrary(lib);
                    }
                    // @ts-ignore
                    const migrated = await window.go.main.App.GetConfiguredLibraries();
                    setLibraries(migrated);
                } else {
                    setLibraries(serverLibs);
                }
            });
        }
    }, []);

    // Determine active index based on current vamPath or default to 0
    const [activeLibIndex, setActiveLibIndex] = useState(() => {
        const current = localStorage.getItem("activeLibraryPath");
        const saved = localStorage.getItem("savedLibraries");
        const libs = saved ? JSON.parse(saved) : [];
        if (current) {
            const idx = libs.indexOf(current);
            if (idx !== -1) return idx;
            return 0;
        }
        return 0;
    });

    // Ref to track active index for stale closures (e.g. Toasts)
    const activeLibIndexRef = useRef(activeLibIndex);
    useEffect(() => {
        activeLibIndexRef.current = activeLibIndex;
    }, [activeLibIndex]);

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
    const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 });

    const { creatorStatus, typeStatus } = useMemo(() => {
        const cStatus: Record<string, 'normal' | 'warning' | 'error'> = {};
        const tStatus: Record<string, 'normal' | 'warning' | 'error'> = {};

        const updateStatus = (map: Record<string, 'normal' | 'warning' | 'error'>, key: string, pkgStatus: 'normal' | 'warning' | 'error') => {
            const current = map[key] || 'normal';
            if (pkgStatus === 'error') map[key] = 'error';
            else if (pkgStatus === 'warning' && current !== 'error') map[key] = 'warning';
            else if (!map[key]) map[key] = 'normal';
        };

        packages.forEach(p => {
            let status: 'normal' | 'warning' | 'error' = 'normal';
            if (p.isEnabled) {
                if (p.missingDeps && p.missingDeps.length > 0) status = 'error';
                else if (p.isDuplicate) status = 'warning';
            }

            if (p.meta.creator) updateStatus(cStatus, p.meta.creator, status);
            else updateStatus(cStatus, "Unknown", status);

            if (p.categories && p.categories.length > 0) {
                p.categories.forEach(c => updateStatus(tStatus, c, status));
            } else {
                updateStatus(tStatus, "Unknown", status);
            }
        });
        return { creatorStatus: cStatus, typeStatus: tStatus };
    }, [packages]);

    // UI State
    const [viewMode, setViewMode] = useState<'grid' | 'list'>(window.innerWidth < 768 ? 'list' : 'grid');
    const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 768);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isTagsVisible, setIsTagsVisible] = useState(false);
    const [sortMode, setSortMode] = useState<string>(localStorage.getItem("sortMode") || 'name-asc');
    const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);
    const [currentFilter, setCurrentFilter] = useState("all");
    const [selectedCreator, setSelectedCreator] = useState<string | null>(null);
    const [selectedType, setSelectedType] = useState<string | null>(null);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [censorThumbnails, setCensorThumbnails] = useState(() => localStorage.getItem('censorThumbnails') === 'true');

    // Keybinds State
    const [keybinds, setKeybinds] = useState<{ [key: string]: string }>(() => {
        const saved = localStorage.getItem('keybinds');
        return saved ? JSON.parse(saved) : { togglePrivacy: 'v' };
    });

    const updateKeybind = (action: string, key: string) => {
        setKeybinds(prev => {
            const next = { ...prev, [action]: key };
            localStorage.setItem('keybinds', JSON.stringify(next));
            return next;
        });
    };

    // Hotkey Listener
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if typing in input/textarea
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

            // Toggle Censor
            if (e.key.toLowerCase() === keybinds.togglePrivacy?.toLowerCase()) {
                setCensorThumbnails(prev => {
                    const newVal = !prev;
                    localStorage.setItem('censorThumbnails', newVal.toString());
                    addToast(newVal ? "Privacy Mode Enabled" : "Privacy Mode Disabled", 'info');
                    return newVal;
                });
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [keybinds]); // Depend on keybinds to update listener only when bindings change

    // Filter State
    const [searchQuery, setSearchQuery] = useState("");
    const [tagSearchQuery, setTagSearchQuery] = useState("");
    const [isTagSearchOpen, setIsTagSearchOpen] = useState(false);

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(() => parseInt(localStorage.getItem('itemsPerPage') || '25'));
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const addToast = (message: string, type: ToastType = 'info', action?: () => void) => {
        const id = Date.now().toString(36) + Math.random().toString(36).substr(2);
        setToasts(prev => [...prev, { id, message, type, action }]);
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
    // Settings
    // (State moved to top)
    const [gridSize, setGridSize] = useState(parseInt(localStorage.getItem("gridSize") || "160"));

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
    // Bulk Resolve State
    const [bulkResolveData, setBulkResolveData] = useState<{ open: boolean, count: number, plan: { keep: VarPackage, others: string[] }[] }>({ open: false, count: 0, plan: [] });

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

    // Persist active tab for RightSidebar
    const [activeRightSidebarTab, setActiveRightSidebarTab] = useState<'details' | 'contents'>(() => {
        return (localStorage.getItem('rightSidebarTab') as 'details' | 'contents') || 'details';
    });

    const handleRightTabChange = (tab: 'details' | 'contents') => {
        setActiveRightSidebarTab(tab);
        localStorage.setItem('rightSidebarTab', tab);
    };

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

            // Sync MinimizeOnClose - Start/Stop Tray
            const storedMinimize = localStorage.getItem('minimizeOnClose') === 'true';
            // @ts-ignore
            window.go.main.App.SetMinimizeOnClose(storedMinimize);

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
                    if (data.path) {
                        // Trust server config
                        setActiveLibraryPath(data.path);
                        localStorage.setItem('activeLibraryPath', data.path);
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

    // Web Mode SSE Listener
    useEffect(() => {
        // @ts-ignore
        if (!window.go) {
            console.log("Connecting to EventSource...");
            const es = new EventSource('/api/events');

            // Batching for Web Mode
            let pkgBuffer: any[] = [];
            let lastFlush = Date.now();
            let flushTimer: any = null;

            const flush = () => {
                if (pkgBuffer.length === 0) return;
                const batch = [...pkgBuffer];
                pkgBuffer = [];
                setPackages(prev => {
                    // Check duplicates? For web mode, maybe expensive.
                    // Just append for speed, filter later if needed or rely on Set
                    return [...prev, ...batch];
                });
            };

            es.onmessage = (event) => {
                try {
                    const payload = JSON.parse(event.data);
                    const { event: type, data } = payload;

                    if (type === "scan:progress") {
                        setScanProgress({ current: data.current, total: data.total });
                        setLoading(true);
                    } else if (type === "server:log") {
                        setServerLogs(prev => [...prev.slice(-99), data]);
                    } else if (type === "package:scanned") {
                        pkgBuffer.push(data);
                        const now = Date.now();
                        if (now - lastFlush > 200) {
                            flush();
                            lastFlush = now;
                        } else if (!flushTimer) {
                            flushTimer = setTimeout(() => {
                                flush();
                                lastFlush = Date.now();
                                flushTimer = null;
                            }, 200);
                        }
                    } else if (type === "scan:complete") {
                        if (flushTimer) clearTimeout(flushTimer);
                        flush();
                        setLoading(false);
                    }
                } catch (e) {
                    console.error("SSE parse error", e);
                }
            };

            return () => es.close();
        }
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

    // Update Title
    useEffect(() => {
        if (activeLibraryPath) {
            const libName = activeLibraryPath.split(/[/\\]/).pop() || activeLibraryPath;
            document.title = `Library - ${libName}`;
        } else {
            document.title = "YAVAM";
        }
    }, [activeLibraryPath]);

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

    // Scan packages only when the active library PATH changes
    useEffect(() => {
        if (activeLibraryPath) {
            scanPackages();
        }
    }, [activeLibraryPath]);

    // Sync Active Index when libraries list changes (e.g. reorder)
    useEffect(() => {
        if (activeLibraryPath && libraries.length > 0) {
            const idx = libraries.findIndex(l => l.toLowerCase() === activeLibraryPath.toLowerCase());
            if (idx !== -1 && idx !== activeLibIndex) {
                setActiveLibIndex(idx);
            }
        }
    }, [libraries]); // activeLibraryPath is stable usually, but we can include it. Split logic is key.

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
    }, [packages, searchQuery, currentFilter, selectedCreator, selectedType, selectedTags]);

    // Reset pagination when FILTERS change, but NOT when data updates (scanning)
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, currentFilter, selectedCreator, selectedType, selectedTags]);

    const scanPackages = async () => {
        if (!activeLibraryPath) return;
        setLoading(true);
        setPackages([]); // Clear current list immediately
        setFilteredPkgs([]);
        setScanProgress({ current: 0, total: 0 });

        // @ts-ignore
        if (window.go) {
            // Remove old listeners to prevent duplicates
            // @ts-ignore
            window.runtime.EventsOff("package:scanned");
            // @ts-ignore
            window.runtime.EventsOff("scan:progress");
            // @ts-ignore
            window.runtime.EventsOff("scan:complete");
            // @ts-ignore
            window.runtime.EventsOff("scan:error");

            // Setup Listeners
            // Reset state
            setPackages([]);
            setFilteredPkgs([]);
            setLoading(true);
            setScanProgress({ current: 0, total: 0 });

            // Batching Buffer
            let packageBuffer: VarPackage[] = [];
            let lastUpdate = Date.now();
            let updateTimer: any = null;

            const flushBuffer = () => {
                if (packageBuffer.length === 0) return;
                const batch = [...packageBuffer];
                packageBuffer = []; // Clear local buffer
                setPackages(prev => {
                    // Filter duplicates in batch?
                    return [...prev, ...batch];
                });
            };

            // @ts-ignore
            window.runtime.EventsOn("package:scanned", (data: VarPackage) => {
                // Determine if enabled (legacy fix)
                const pkg = { ...data, isEnabled: data.filePath.endsWith(".var") };
                packageBuffer.push(pkg);

                // Throttle updates to every 200ms
                const now = Date.now();
                if (now - lastUpdate > 200) {
                    flushBuffer();
                    lastUpdate = now;
                } else if (!updateTimer) {
                    updateTimer = setTimeout(() => {
                        flushBuffer();
                        lastUpdate = Date.now();
                        updateTimer = null;
                    }, 200);
                }
            });

            // @ts-ignore
            window.runtime.EventsOn("scan:progress", (data: any) => {
                setScanProgress({ current: data.current, total: data.total });
            });
            // @ts-ignore
            window.runtime.EventsOn("scan:complete", () => {
                if (updateTimer) clearTimeout(updateTimer);
                flushBuffer(); // Final flush

                setPackages(prev => {
                    const analyzed = analyzePackages(prev);
                    // Extract tags
                    setTimeout(() => {
                        const tags = new Set<string>();
                        analyzed.forEach(p => p.tags?.forEach(t => tags.add(t)));
                        setAvailableTags(Array.from(tags).sort());
                    }, 0);
                    return analyzed;
                });
                setLoading(false);
            });
            // @ts-ignore
            window.runtime.EventsOn("scan:error", (err: string) => {
                console.error("Scan error:", err);
                setLoading(false);
            });

            try {
                // @ts-ignore
                await window.go.main.App.ScanPackages(activeLibraryPath);
            } catch (e) {
                console.error(e);
                setLoading(false);
            }
        } else {
            // Web Mode
            setPackages([]); // Clear existing to show progress
            try {
                const res = await fetch(`/api/packages?path=${encodeURIComponent(activeLibraryPath)}`);
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.message || `HTTP ${res.status}`);
                }
                const pkgs = await res.json();
                if (Array.isArray(pkgs)) {
                    setPackages(analyzePackages(pkgs));
                    const tags = new Set<string>();
                    pkgs.forEach((p: any) => p.tags?.forEach((t: string) => tags.add(t)));
                    setAvailableTags(Array.from(tags));
                } else {
                    if (pkgs.success === false) throw new Error(pkgs.message);
                }
            } catch (e: any) {
                console.error(e);
                alert("Scan Error: " + e.message);
            } finally {
                setLoading(false);
            }
        }
    };

    const filterPackages = () => {
        let res = [...packages];

        // Status Filter
        if (currentFilter === "enabled") res = res.filter(p => p.isEnabled);
        if (currentFilter === "disabled") res = res.filter(p => !p.isEnabled);
        if (currentFilter === "missing-deps") res = res.filter(p => p.missingDeps && p.missingDeps.length > 0);
        if (currentFilter === "duplicates") res = res.filter(p => p.isDuplicate);

        // Creator Filter
        if (selectedCreator) res = res.filter(p => p.meta?.creator === selectedCreator);

        // Type Filter (Category)
        if (selectedType) {
            res = res.filter(p => {
                if (p.categories && p.categories.length > 0) {
                    return p.categories.includes(selectedType);
                }
                return p.type === selectedType;
            });
        }

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
            res = res.filter(p => {
                const matchesName = p.fileName.toLowerCase().includes(q);
                const matchesCreator = p.meta?.creator?.toLowerCase().includes(q);
                // Also search package name specifically?
                const matchesPkg = p.meta?.packageName?.toLowerCase().includes(q);
                return matchesName || matchesCreator || matchesPkg;
            });
        }

        // Sorting
        res.sort((a, b) => {
            switch (sortMode) {
                case 'name-asc':
                    return a.fileName.localeCompare(b.fileName);
                case 'name-desc':
                    return b.fileName.localeCompare(a.fileName);
                case 'size-asc':
                    return a.size - b.size;
                case 'size-desc':
                    return b.size - a.size;
                case 'date-newest':
                    // @ts-ignore
                    return new Date(b.creationDate || 0).getTime() - new Date(a.creationDate || 0).getTime();
                case 'date-oldest':
                    // @ts-ignore
                    return new Date(a.creationDate || 0).getTime() - new Date(b.creationDate || 0).getTime();
                default:
                    return 0;
            }
        });

        setFilteredPkgs(res);
    };

    // Trigger filtering when state changes
    useEffect(() => {
        filterPackages();
    }, [packages.length, currentFilter, selectedCreator, selectedType, selectedTags, searchQuery, sortMode]);

    // Persist Sort Mode
    useEffect(() => {
        localStorage.setItem("sortMode", sortMode);
    }, [sortMode]);

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

    const analyzePackages = (pkgs: VarPackage[]): VarPackage[] => {
        // 1. Build Index (Available Packages)
        const pkgIds = new Set<string>();

        pkgs.forEach(p => {
            // We count disabled packages as "available" for resolution? 
            // Usually only enabled packages provide dependencies in VaM.
            if (p.isEnabled) {
                const id = `${p.meta.creator}.${p.meta.packageName}.${p.meta.version}`;
                pkgIds.add(id);
            }
        });

        // 2. Duplicate Counts
        const counts: Record<string, number> = {};
        pkgs.forEach(p => {
            if (p.isEnabled) {
                const key = `${p.meta.creator}.${p.meta.packageName}`;
                counts[key] = (counts[key] || 0) + 1;
            }
        });

        // 3. Process each package
        return pkgs.map(p => {
            let isDuplicate = false;
            let missingDeps: string[] = [];

            if (p.isEnabled) {
                const key = `${p.meta.creator}.${p.meta.packageName}`;
                if ((counts[key] || 0) > 1) isDuplicate = true;

                // Dependencies
                if (p.meta.dependencies) {
                    Object.keys(p.meta.dependencies).forEach(depId => {
                        // depId format: Creator.Package.Version
                        // VaM dependencies are strict on version.
                        if (!pkgIds.has(depId)) {
                            // Try to be smart? No, VaM is strict.
                            if (depId !== "VaM.Core.latest" && !depId.startsWith("system.")) { // Ignore core/system?
                                missingDeps.push(depId);
                            }
                        }
                    });
                }
            }

            // Only update if changed to avoid unnecessary re-renders? 
            // map always returns new object, react will re-render. That's fine for "complete" event.
            return { ...p, isDuplicate, missingDeps };
        });
    };

    const recalculateDuplicates = (currentPkgs: VarPackage[]): VarPackage[] => {
        return analyzePackages(currentPkgs);
    };

    const togglePackage = async (pkg: VarPackage, merge = false, silent = false) => {
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

            if (!silent) addToast(pkg.isEnabled ? "Package disabled" : "Package enabled", 'success');

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

    const handleConfirmBulkResolve = async () => {
        if (bulkResolveData.plan.length === 0) {
            setBulkResolveData(prev => ({ ...prev, open: false }));
            return;
        }
        setBulkResolveData(prev => ({ ...prev, open: false }));
        setLoading(true);

        let mergedCount = 0;
        let disabledCount = 0;
        let errorCount = 0;

        try {
            for (const item of bulkResolveData.plan) {
                try {
                    // @ts-ignore
                    if (window.go) {
                        // @ts-ignore
                        const res = await window.go.main.App.ResolveConflicts(item.keep.filePath, item.others, activeLibraryPath);
                        mergedCount += res.merged;
                        disabledCount += res.disabled;
                    } else {
                        // Web
                        const res = await fetch('/api/resolve', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                keepPath: item.keep.filePath,
                                others: item.others,
                                libraryPath: activeLibraryPath
                            })
                        }).then(r => r.json());
                        mergedCount += res.merged;
                        disabledCount += res.disabled;
                    }
                } catch (e) {
                    errorCount++;
                    console.error("Failed to resolve item", e);
                }
            }
            addToast(`Batch resolution complete. Merged: ${mergedCount}, Disabled: ${disabledCount}` + (errorCount > 0 ? `, Errors: ${errorCount}` : ""), errorCount > 0 ? 'warning' : 'success');
        } catch (e) {
            console.error(e);
            addToast("Batch resolution failed", 'error');
        } finally {
            setLoading(false);
            scanPackages();
        }
    };

    const handleSidebarAction = async (action: 'enable-all' | 'disable-all' | 'resolve-all', groupType: 'creator' | 'type' | 'status', key: string) => {
        const targets = packages.filter(p => {
            if (groupType === 'creator') return (p.meta.creator || "Unknown") === key;
            if (groupType === 'type') {
                if (p.categories && p.categories.length > 0) return p.categories.includes(key);
                return (p.type || "Unknown") === key;
            }
            if (groupType === 'status') {
                if (key === 'all') return true;
                if (key === 'enabled') return p.isEnabled;
                if (key === 'disabled') return !p.isEnabled;
                if (key === 'missing-deps') return p.missingDeps && p.missingDeps.length > 0;
                if (key === 'duplicates') return p.isDuplicate;
            }
            return false;
        });

        if (targets.length === 0) return;

        if (action === 'resolve-all') {
            // Group by package name
            const groups: Record<string, VarPackage[]> = {};
            targets.forEach(p => {
                // Only consider packages that are actually duplicates?
                // No, resolve-all implies checking for duplicates within the target set OR against global?
                // Usually duplicates are defined globally.
                // We should only resolve groups that have >1 elements.
                const id = `${p.meta.creator}.${p.meta.packageName}`;
                if (!groups[id]) groups[id] = [];
                groups[id].push(p);
            });

            const plan: { keep: VarPackage, others: string[] }[] = [];
            let totalToUpdate = 0;

            for (const pid in groups) {
                const group = groups[pid];
                // If the group has only 1 item in the filtered view, but that item IS a duplicate globally,
                // should we resolve it?
                // Current logic: We only resolve conflicts WITHIN the selected set?
                // Or do we resolve conflicts for any selected item against the world?
                // User expects "Fix Conflicts" for "Creator X". This likely means "Fix conflicts where Creator X involved".
                // But wait, `p` includes ALL packages. `targets` are filtered.
                // If I filter by Creator X, I might see pkg A v1.
                // Pkg A v2 might be by Creator Y? (Unlikely for same package).
                // So generally safe.

                // BUT: If I filter by "Status: Duplicates", group will have all versions.

                // Issue: If `targets` doesn't contain all versions (e.g. filtered by tag), we might resolving partially?
                // We should probably find ALL duplicates for the target packages from the global `packages` list to be safe.

                // Improved Logic:
                // 1. Identify Unique Packages (Name+Creator) in targets that are marked as duplicate.
                // 2. For each, find ALL versions in `packages` (global).
                // 3. Resolve them.

                if (group.length <= 1) {
                    // Check global packages if this item is a duplicate
                    if (group.length === 1 && group[0].isDuplicate) {
                        const p = group[0];
                        const allVersions = packages.filter(pk => pk.meta.creator === p.meta.creator && pk.meta.packageName === p.meta.packageName);
                        if (allVersions.length > 1) {
                            // Use this global group
                            group.length = 0; // Clear
                            group.push(...allVersions);
                        }
                    } else {
                        continue;
                    }
                }
                if (group.length <= 1) continue;

                // Sort by version (descending)
                group.sort((a, b) => {
                    const vA = parseInt(a.meta.version) || 0;
                    const vB = parseInt(b.meta.version) || 0;
                    return vB - vA;
                });

                const keep = group[0];
                const others = group.slice(1).map(x => x.filePath);
                plan.push({ keep, others });
                totalToUpdate += others.length;
            }

            if (plan.length === 0) {
                addToast("No solvable conflicts found in selection", 'info');
                return;
            }

            setBulkResolveData({ open: true, count: totalToUpdate, plan });
            return;
        }

        setLoading(true);
        try {
            if (action === 'enable-all') {
                let count = 0;
                for (const p of targets) {
                    if (!p.isEnabled) {
                        await togglePackage(p, false, true);
                        count++;
                    }
                }
                addToast(`Enabled ${count} packages in ${key}`, 'success');
            } else if (action === 'disable-all') {
                const toDisable = targets.filter(p => p.isEnabled);
                for (const p of toDisable) {
                    await togglePackage(p, false, true);
                }
                addToast(`Disabled ${toDisable.length} packages in ${key}`, 'success');
            }
        } catch (e: any) {
            console.error(e);
            addToast("Bulk action failed: " + e.message, 'error');
        } finally {
            setLoading(false);
            scanPackages();
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


    }

    // Render Setup Wizard if needed
    if (needsSetup) {
        return (
            <>
                <TitleBar />
                {/* @ts-ignore */}
                <SetupWizard onComplete={(libPath?: string) => {
                    setNeedsSetup(false);
                    if (libPath) {
                        handleAddLibrary(libPath);
                    }
                }} />
            </>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-gray-900 text-white overflow-hidden">
            <TitleBar />
            <div className="flex-1 flex overflow-hidden relative">
                <DragDropOverlay onDrop={handleDrop} onWebUpload={handleWebUpload} />


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
                    // @ts-ignore
                    isWeb={!window.go}
                    censorThumbnails={censorThumbnails}
                    setCensorThumbnails={setCensorThumbnails}
                    keybinds={keybinds}
                    onUpdateKeybind={updateKeybind}
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

                <ConfirmationModal
                    isOpen={bulkResolveData.open}
                    onClose={() => setBulkResolveData(prev => ({ ...prev, open: false }))}
                    onConfirm={handleConfirmBulkResolve}
                    title="Confirm Bulk Resolution"
                    message={`This will automatically resolve conflicts for ${bulkResolveData.plan.length} distinct packages. ${bulkResolveData.count} older versions will be disabled or merged, leaving only the newest version active. This action cannot be undone easily.\n\nAre you sure you want to proceed?`}
                    confirmText="Fix All Conflicts"
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
                            creatorStatus={creatorStatus}
                            typeStatus={typeStatus}
                            onSidebarAction={handleSidebarAction}
                            onOpenSettings={() => setIsSettingsOpen(true)}

                            // Library Switcher Props
                            libraries={libraries}
                            currentLibIndex={activeLibIndex}
                            onSelectLibrary={(index) => handleSwitchLibrary(index)}
                            // Only allow management on Desktop
                            // @ts-ignore
                            onAddLibrary={window.go ? handleBrowseAndAdd : undefined}
                            // @ts-ignore
                            onRemoveLibrary={window.go ? (index) => handleRemoveLibrary(libraries[index]) : undefined}
                            onReorderLibraries={handleReorderLibraries}
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

                                    {/* Sorting Dropdown Trigger */}
                                    <div className="relative shrink-0">
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

                                        {/* Dropdown Menu */}
                                        <AnimatePresence>
                                            {isSortDropdownOpen && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                                    className="absolute right-0 top-full mt-2 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden"
                                                >
                                                    <div className="flex flex-col py-1">
                                                        {[
                                                            { id: 'name-asc', label: 'Name (A-Z)', icon: <ArrowUpAZ size={14} /> },
                                                            { id: 'name-desc', label: 'Name (Z-A)', icon: <ArrowDownZA size={14} /> },
                                                            { id: 'size-desc', label: 'Size (Largest)', icon: <ArrowDownWideNarrow size={14} /> },
                                                            { id: 'size-asc', label: 'Size (Smallest)', icon: <ArrowUpNarrowWide size={14} /> },
                                                            { id: 'date-newest', label: 'Date (Newest)', icon: <Calendar size={14} /> },
                                                            { id: 'date-oldest', label: 'Date (Oldest)', icon: <Calendar size={14} /> },
                                                        ].map(opt => (
                                                            <button
                                                                key={opt.id}
                                                                onClick={() => {
                                                                    setSortMode(opt.id);
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

                                        {/* Backdrop to close */}
                                        {isSortDropdownOpen && (
                                            <div
                                                className="fixed inset-0 z-40 bg-transparent"
                                                onClick={() => setIsSortDropdownOpen(false)}
                                            />
                                        )}
                                    </div>
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
                                    {loading ? (
                                        <ScanProgressBar current={scanProgress.current} total={scanProgress.total} />
                                    ) : (
                                        <span className="hidden sm:inline">{filteredPkgs.length} packages found</span>
                                    )}
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
                                    censorThumbnails={censorThumbnails}
                                />
                            </div>

                            {/* Pagination Footer */}
                            {filteredPkgs.length > itemsPerPage && (
                                <Pagination
                                    currentPage={currentPage}
                                    totalItems={filteredPkgs.length}
                                    itemsPerPage={itemsPerPage}
                                    onChange={setCurrentPage}
                                />
                            )}
                        </div>

                        <AnimatePresence>
                            {(selectedPackage && selectedIds.size === 1 && isDetailsPanelOpen) && (
                                <RightSidebar
                                    pkg={selectedPackage}
                                    onClose={() => { setIsDetailsPanelOpen(false); setSelectedPackage(null); setSelectedIds(new Set()); }}
                                    onResolve={handleOpenResolve}
                                    activeTab={activeRightSidebarTab}
                                    onTabChange={handleRightTabChange}
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
            {/* Cancellation Modal */}
            <AnimatePresence>
                {isCancelling && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
                    >
                        <div className="bg-gray-800 border border-gray-700 rounded-xl p-8 flex flex-col items-center gap-4 shadow-2xl">
                            <div className="animate-spin text-blue-500">
                                <RefreshCw size={48} />
                            </div>
                            <h3 className="text-xl font-bold text-white">Cancelling Scan...</h3>
                            <p className="text-gray-400 text-sm">Please wait while we stop the current process.</p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Install Modal */}
            <AnimatePresence>
                {installModal.open && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                        <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl p-6 w-full max-w-sm">
                            <h2 className="text-xl font-bold text-white mb-4">Install to Library</h2>
                            <p className="text-gray-400 mb-4">Select the destination library for {installModal.pkgs.length} package(s):</p>
                            <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar mb-4">
                                {libraries.filter(l => l.toLowerCase() !== activeLibraryPath.toLowerCase()).map(lib => (
                                    <button
                                        key={lib}
                                        onClick={async () => {
                                            console.log("Install button clicked for lib:", lib);
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

                                                    // Desktop Install
                                                    // @ts-ignore
                                                    await window.go.main.App.InstallFiles(paths, lib);

                                                    const destIndex = libraries.findIndex(l => l === lib);
                                                    addToast(`Installed ${paths.length} packages`, 'success', () => {
                                                        if (destIndex !== -1) handleSwitchLibrary(destIndex);
                                                    });

                                                    setInstallModal({ open: false, pkgs: [] });
                                                } catch (e) {
                                                    addToast("Install failed: " + e, 'error');
                                                }
                                            } else {
                                                console.log("Web mode install detected");
                                                // Web Mode
                                                try {
                                                    const paths = installModal.pkgs.map(p => p.filePath);
                                                    console.log("Installing paths:", paths, "to", lib);
                                                    const res = await fetch("/api/install", {
                                                        method: "POST",
                                                        headers: { "Content-Type": "application/json" },
                                                        body: JSON.stringify({
                                                            filePaths: paths,
                                                            destLib: lib,
                                                            overwrite: false
                                                        })
                                                    });
                                                    const data = await res.json();
                                                    if (!res.ok) throw new Error(data.message || "Install failed");

                                                    if (data.collisions && data.collisions.length > 0) {
                                                        setInstallModal({ open: false, pkgs: [] });
                                                        setInstallCollision({ open: true, collisions: data.collisions, libPath: lib, pkgs: installModal.pkgs });
                                                        return;
                                                    }

                                                    const destIndex = libraries.findIndex(l => l === lib);
                                                    addToast(`Installed ${paths.length} packages`, 'success', () => {
                                                        if (destIndex !== -1) handleSwitchLibrary(destIndex);
                                                    });

                                                    setInstallModal({ open: false, pkgs: [] });
                                                } catch (e: any) {
                                                    console.error("Install error:", e);
                                                    addToast(e.message, 'error');
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
                                        // @ts-ignore
                                        // Overwrite logic
                                        // @ts-ignore
                                        if (window.go) {
                                            try {
                                                const paths = installCollision.pkgs.map(p => p.filePath);
                                                // @ts-ignore
                                                await window.go.main.App.CopyPackagesToLibrary(paths, installCollision.libPath, true);
                                                addToast(`Installed/Overwrote ${paths.length} packages`, 'success');
                                                setInstallCollision({ open: false, collisions: [], libPath: "", pkgs: [] });
                                            } catch (e) {
                                                addToast("Install failed: " + e, 'error');
                                            }
                                        } else {
                                            try {
                                                const paths = installCollision.pkgs.map(p => p.filePath);
                                                const res = await fetch("/api/install", {
                                                    method: "POST",
                                                    headers: { "Content-Type": "application/json" },
                                                    body: JSON.stringify({
                                                        filePaths: paths,
                                                        destLib: installCollision.libPath,
                                                        overwrite: true
                                                    })
                                                });
                                                const data = await res.json();
                                                if (!res.ok) throw new Error(data.message || "Install failed");

                                                addToast(`Installed/Overwrote ${paths.length} packages`, 'success');
                                                setInstallCollision({ open: false, collisions: [], libPath: "", pkgs: [] });
                                            } catch (e: any) {
                                                addToast(e.message, 'error');
                                            }
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

            <UpgradeModal
                open={showUpdateModal}
                version={updateInfo ? updateInfo.version : ''}
                onUpdate={handleUpdate}
                onCancel={() => setShowUpdateModal(false)}
                downloading={isUpdating}
            />

            {/* Toasts Container - Lifted to avoid Pagination (bottom-20) */}
            <div className="fixed bottom-20 right-4 z-50 flex flex-col items-end pointer-events-none">

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
