import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { RefreshCw, Search, X, PanelLeft, LayoutGrid, List, Filter, WifiOff, ArrowUpDown, Calendar, ArrowUpAZ, ArrowDownZA, ArrowDownWideNarrow, ArrowUpNarrowWide } from 'lucide-react';
import clsx from 'clsx';
import { Toast, ToastItem, ToastType } from './components/Toast';
import DragDropOverlay from './components/DragDropOverlay';
import ContextMenu from './components/ContextMenu';

import CardGrid from './components/CardGrid';
import Sidebar from './components/Sidebar';


import SettingsModal from './components/SettingsModal';
import ConfirmationModal from './components/ConfirmationModal';
import RightSidebar from './components/RightSidebar';
import TitleBar from './components/TitleBar';
import SetupWizard from './components/SetupWizard';
import { UpgradeModal } from "./components/UpgradeModal";
import { Pagination } from './components/Pagination';
import { ScanProgressBar } from './components/ScanProgressBar';
import { OptimizationModal, ManualPlan } from './components/OptimizationModal';
import { OptimizationProgressModal } from './components/OptimizationProgressModal';
import { InstallPackageModal } from './components/InstallPackageModal';

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
    isExactDuplicate: boolean;
    type?: string;
    categories: string[];
    tags?: string[];
}

function App(): JSX.Element {
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
    const scanAbortController = useRef<AbortController | null>(null);

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
    const [maxToasts, setMaxToasts] = useState(() => parseInt(localStorage.getItem('maxToasts') || '5'));

    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const addToast = (message: string, type: ToastType = 'info', action?: () => void) => {
        const id = Date.now().toString(36) + Math.random().toString(36).substr(2);
        setToasts(prev => {
            const newToasts = [...prev, { id, message, type, action }];
            if (newToasts.length > maxToasts) {
                return newToasts.slice(newToasts.length - maxToasts);
            }
            return newToasts;
        });
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

    // Bulk Resolve State
    // Bulk Optimization State
    const [optimizationData, setOptimizationData] = useState<{
        open: boolean;
        mergePlan: { keep: VarPackage; delete: VarPackage[] }[];
        resolveGroups: { id: string; packages: VarPackage[] }[];
        forceGlobalMode?: boolean;
        targetPackage?: VarPackage;
    }>({ open: false, mergePlan: [], resolveGroups: [], forceGlobalMode: false, targetPackage: undefined });

    // Optimization Progress State
    const [optimizationProgress, setOptimizationProgress] = useState<{
        open: boolean;
        current: number;
        total: number;
        currentFile: string;
        spaceSaved: number;
        completed: boolean;
        errors: string[];
    }>({ open: false, current: 0, total: 0, currentFile: '', spaceSaved: 0, completed: false, errors: [] });
    // Bulk Merge State


    // Context Menu State
    const [contextMenu, setContextMenu] = useState<{ open: boolean, x: number, y: number, pkg: VarPackage | null }>({ open: false, x: 0, y: 0, pkg: null });

    // Delete Confirmation State
    const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean, pkg: VarPackage | null }>({ open: false, pkg: null });

    // Collision Confirmation State
    const [collisionData, setCollisionData] = useState<{ open: boolean, pkg: VarPackage | null }>({ open: false, pkg: null });

    // Install Modal State
    const [installModal, setInstallModal] = useState<{ open: boolean, pkgs: VarPackage[] }>({ open: false, pkgs: [] });
    // Install Collision
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

                    const savedPath = localStorage.getItem("activeLibraryPath");

                    const normalize = (p: string) => p.toLowerCase().replace(/[\\/]/g, '/');
                    let foundLib: string | undefined;

                    if (savedPath && data.libraries && Array.isArray(data.libraries)) {
                        const savedNorm = normalize(savedPath);
                        foundLib = data.libraries.find((lib: string) => normalize(lib) === savedNorm);
                    }

                    if (foundLib) {
                        // Use the matched library path from server list (canonical)
                        setActiveLibraryPath(foundLib);
                        // Update storage to match canonical if needed
                        if (foundLib !== savedPath) localStorage.setItem('activeLibraryPath', foundLib);
                    } else if (data.path) {
                        // Fallback to server active path
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
                    // Deduplicate logic: Create Set of existing paths
                    const existingPaths = new Set(prev.map(p => p.filePath));
                    const uniqueBatch = batch.filter(p => !existingPaths.has(p.filePath));

                    if (uniqueBatch.length === 0) return prev;
                    return [...prev, ...uniqueBatch];
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
                        // Keep only last 100 logs
                        setServerLogs(prev => [...prev.slice(-99), data]);
                    } else if (type === "package:scanned") {
                        // Filter by active path (using ref to avoid stale closure if effect assumes [])
                        // However, activeLibraryPath is state. We need a way to access current value.
                        // We can use the localStorage backup or a specific Ref.
                        // Let's rely on the assumption that if this listener is active, we care about the current view.
                        // But wait, if we switch library, this effect DOES NOT rerun because dep array is [].
                        // We must use a Ref.

                        // Check against the Ref we created earlier: activeLibIndexRef? No that's index.
                        // Let's check the path. 
                        // NOTE: I will inject a Ref for `activeLibraryPath` in the next step or assume one exists.
                        // Actually, I can just use `window.localStorage.getItem('activeLibraryPath')` as a crude but effective live check?
                        // Or better, I should fix the effect dependency to restart on path change?
                        // Restarting SSE on every path change is okay.

                        const currentPath = localStorage.getItem('activeLibraryPath') || "";
                        if (currentPath && data.filePath) {
                            const normPkg = data.filePath.replace(/\\/g, '/').toLowerCase();
                            const normLib = currentPath.replace(/\\/g, '/').toLowerCase();
                            if (!normPkg.includes(normLib)) return;
                        }

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
                    } else {
                        // Dispatch other events (like install-progress) globally for components to pick up
                        window.dispatchEvent(new CustomEvent(type, { detail: data }));
                    }
                } catch (e) {
                    console.error("SSE parse error", e);
                }
            };

            return () => {
                console.log("Closing SSE connection");
                if (flushTimer) clearTimeout(flushTimer);
                es.close();
            };
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
            // @ts-ignore
            window.runtime.EventsOff("package:scanned");
            // @ts-ignore
            window.runtime.EventsOff("scan:progress");
            // @ts-ignore
            window.runtime.EventsOff("scan:complete");
            // @ts-ignore
            window.runtime.EventsOff("scan:error");

            setPackages([]);
            setFilteredPkgs([]);
            setLoading(true);
            setScanProgress({ current: 0, total: 0 });

            // Batching Buffer
            let packageBuffer: VarPackage[] = [];
            let lastUpdate = Date.now();
            let updateTimer: any = null;

            // Capture the path associated with THIS scan invocation
            const currentScanPath = activeLibraryPath;

            const flushBuffer = () => {
                if (packageBuffer.length === 0) return;
                const batch = [...packageBuffer];
                packageBuffer = []; // Clear local buffer
                setPackages(prev => {
                    // Deduplicate logic: Create Set of existing paths
                    const existingPaths = new Set(prev.map(p => p.filePath));
                    const uniqueBatch = batch.filter(p => !existingPaths.has(p.filePath));

                    if (uniqueBatch.length === 0) return prev;
                    return [...prev, ...uniqueBatch];
                });
            };

            // @ts-ignore
            window.runtime.EventsOn("package:scanned", (data: VarPackage) => {
                // Determine if enabled (legacy fix)
                const pkg = { ...data, isEnabled: data.filePath.endsWith(".var") };

                // CRITICAL FIX: Ignore packages that don't belong to this library
                // Assuming filePath contains absolute path, check if it starts with activeLibraryPath
                // Handle mixed slashes windows/linux
                const normalizedPkgPath = pkg.filePath.replace(/\\/g, '/').toLowerCase();
                const normalizedLibPath = currentScanPath.replace(/\\/g, '/').toLowerCase();

                if (!normalizedPkgPath.includes(normalizedLibPath)) {
                    // console.warn("Ignoring package from different library:", pkg.filePath);
                    return;
                }

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
                // Ignore "context canceled" errors if we caused them
                if (err.includes("canceled")) return;
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

            // Cancel previous scan if running
            if (scanAbortController.current) {
                scanAbortController.current.abort();
            }
            const controller = new AbortController();
            scanAbortController.current = controller;

            try {
                const res = await fetch(`/api/packages?path=${encodeURIComponent(activeLibraryPath)}`, {
                    signal: controller.signal
                });

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
                if (e.name === 'AbortError') return; // Ignore intentional aborts
                if (e.message === 'context canceled') return; // Ignore backend cancellation

                console.error(e);
                addToast("Scan Error: " + e.message, 'error');
            } finally {
                // Only unset loading if THIS is the active request
                if (scanAbortController.current === controller) {
                    setLoading(false);
                    scanAbortController.current = null;
                }
            }
        }
    };

    const filterPackages = () => {
        let res = [...packages];

        // Status Filter
        if (currentFilter === "enabled") res = res.filter(p => p.isEnabled);
        if (currentFilter === "disabled") res = res.filter(p => !p.isEnabled);
        if (currentFilter === "missing-deps") res = res.filter(p => p.missingDeps && p.missingDeps.length > 0);
        if (currentFilter === "version-conflicts") res = res.filter(p => p.isDuplicate);
        if (currentFilter === "duplicates") res = res.filter(p => p.isDuplicate); // Backwards compat or if used
        if (currentFilter === "exact-duplicates") res = res.filter(p => p.isExactDuplicate);

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
    }, [packages, currentFilter, selectedCreator, selectedType, selectedTags, searchQuery, sortMode]);

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
        // 1. Build Index and Group by "Creator.Package"
        const pkgIds = new Set<string>();
        const groups = new Map<string, VarPackage[]>();

        pkgs.forEach(p => {
            if (p.meta && p.meta.creator && p.meta.packageName) {
                const id = `${p.meta.creator}.${p.meta.packageName}.${p.meta.version}`;
                pkgIds.add(id);

                const groupKey = `${p.meta.creator}.${p.meta.packageName}`;
                if (!groups.has(groupKey)) groups.set(groupKey, []);
                groups.get(groupKey)?.push(p);
            }
        });

        // 2. Identify Obsolete Packages (Old Versions)
        // We reuse 'isDuplicate' to mean 'isObsolete' for compatibility with existing filters
        const obsoletePaths = new Set<string>();

        groups.forEach((groupPkgs) => {
            if (groupPkgs.length > 1) {
                // Sort by version descending to find latest
                groupPkgs.sort((a, b) => {
                    // Simple integer parse might fail for complex semver, but assuming int based on user context "v1, v2"
                    // If string, we might need better compare. For now, parseInt is standard for this codebase.
                    const vA = parseInt(a.meta.version) || 0;
                    const vB = parseInt(b.meta.version) || 0;
                    return vB - vA;
                });

                // Index 0 is Latest -> Keep Clean
                // Index 1+ are Obsolete -> Mark
                for (let i = 1; i < groupPkgs.length; i++) {
                    obsoletePaths.add(groupPkgs[i].filePath);
                }
            }
        });

        // 3. Exact Duplicate Detection
        // Strategy: 
        // - Runtime Conflict: Multiple ENABLED copies. (Flag Enabled ones)
        // - Storage Redundancy: Any copies exist. (Flag Disabled ones so they show in list)
        const exactDupesMap = new Map<string, number>();
        const enabledDupesMap = new Map<string, number>();

        pkgs.forEach(p => {
            if (!p.meta || !p.meta.creator || !p.meta.packageName) return;
            const key = `${p.meta.creator}.${p.meta.packageName}.${p.meta.version}.${p.size}`;

            // Count All (Storage)
            exactDupesMap.set(key, (exactDupesMap.get(key) || 0) + 1);

            // Count Enabled (Runtime)
            if (p.isEnabled) {
                enabledDupesMap.set(key, (enabledDupesMap.get(key) || 0) + 1);
            }
        });

        // 4. Process each package
        return pkgs.map(p => {
            let isDuplicate = false; // Now means "Obsolete"
            let isExactDuplicate = false;
            let missingDeps: string[] = [];

            // Mark Obsolete
            if (obsoletePaths.has(p.filePath)) {
                isDuplicate = true;
            }

            // Mark Exact Duplicate
            if (p.meta && p.meta.creator && p.meta.packageName) {
                const exactKey = `${p.meta.creator}.${p.meta.packageName}.${p.meta.version}.${p.size}`;

                if (p.isEnabled) {
                    // Active Package: Only warn if runtime conflict exists
                    if ((enabledDupesMap.get(exactKey) || 0) > 1) {
                        isExactDuplicate = true;
                    }
                } else {
                    // Disabled Package: Warn if it's redundant (storage duplicate)
                    if ((exactDupesMap.get(exactKey) || 0) > 1) {
                        isExactDuplicate = true;
                    }
                }
            }

            // Dependencies
            if (p.isEnabled && p.meta && p.meta.dependencies) {
                Object.keys(p.meta.dependencies).forEach(depId => {
                    if (!pkgIds.has(depId)) {
                        if (depId !== "VaM.Core.latest" && !depId.startsWith("system.")) {
                            missingDeps.push(depId);
                        }
                    }
                });
            }

            return { ...p, isDuplicate, isExactDuplicate, missingDeps };
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
                    body: JSON.stringify({ filePath: pkg.filePath, enable: !pkg.isEnabled, merge: merge, libraryPath: activeLibraryPath })
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

    const handleBulkToggle = async (pkg: VarPackage) => {
        // If multiple items selected and target is in selection, toggle all
        if (selectedIds.has(pkg.filePath) && selectedIds.size > 1) {
            const targets = Array.from(selectedIds).map(id => packages.find(pk => pk.filePath === id)).filter(Boolean) as VarPackage[];
            let successCount = 0;

            // Determine target state based on the clicked item (if clicked is enabled, disable all, vice versa for consistency?)
            // Or just invert each? Sidebar behavior usually inverts each. 
            // Let's invert each for now as per original logic.

            for (const p of targets) {
                await togglePackage(p, false, true); // Silent
                successCount++;
            }
            addToast(`Toggled ${successCount} packages`, 'success');
        } else {
            togglePackage(pkg);
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






    // Instant Merge Handlers
    const handleInstantMerge = async (pkg: VarPackage, inPlace: boolean) => {
        const duplicates = packages.filter(p =>
            p.meta.creator === pkg.meta.creator &&
            p.meta.packageName === pkg.meta.packageName &&
            p.meta.version === pkg.meta.version &&
            p.size === pkg.size &&
            p.filePath !== pkg.filePath
        );

        if (duplicates.length === 0) {
            addToast("No exact duplicates found.", "info");
            return;
        }

        const confirmCount = duplicates.length;
        setLoading(true);
        try {
            // Delete duplicates
            // Delete duplicates
            for (const d of duplicates) {
                // @ts-ignore
                if (window.go) {
                    // @ts-ignore
                    await window.go.main.App.DeleteFileToRecycleBin(d.filePath);
                } else {
                    const res = await fetch('/api/delete', {
                        method: 'POST',
                        body: JSON.stringify({ filePath: d.filePath, libraryPath: activeLibraryPath })
                    }).then(r => r.json());
                    if (!res.success) throw new Error("Web delete failed");
                }
            }

            if (!inPlace) {
                // Move kept file to root check
                const normalize = (p: string) => p.replace(/[\\/]/g, '/').replace(/\/$/, '').toLowerCase();
                const libPathClean = normalize(activeLibraryPath);
                const pkgPath = normalize(pkg.filePath);
                const pkgParent = pkgPath.substring(0, Math.max(pkgPath.lastIndexOf('/'), pkgPath.lastIndexOf('\\')));

                if (pkgParent !== libPathClean) {
                    // Move to root: Copy then Delete original logic
                    // @ts-ignore
                    if (window.go) {
                        // @ts-ignore
                        const newPath = await window.go.main.App.CopyPackagesToLibrary([pkg.filePath], activeLibraryPath, false); // assumes copy returns path or success?
                        // Delete old file
                        // @ts-ignore
                        await window.go.main.App.DeleteFileToRecycleBin(pkg.filePath);
                        addToast(`Merged ${confirmCount + 1} files to root.`, "success");
                    } else {
                        addToast(`Merged ${confirmCount} duplicates (Move to root skipped in Web Mode).`, "warning");
                    }
                } else {
                    addToast(`Merged ${confirmCount} duplicates.`, "success");
                }
            } else {
                addToast(`Merged ${confirmCount} duplicates in place.`, "success");
            }
            scanPackages();
        } catch (e) {
            console.error(e);
            addToast("Merge failed: " + e, "error");
            setLoading(false);
        }
    };

    const handleSingleResolve = (pkg: VarPackage) => {
        // Prepare Optimization Data for a SINGLE package group (Conflicts & Merges)
        const normalize = (p: string) => p.replace(/[\\/]/g, '/').replace(/\/$/, '').toLowerCase();
        const libPathClean = normalize(activeLibraryPath);

        // 1. Find all relevant packages (Same Creator & PackageName)
        const conflictGroup = packages.filter(p =>
            p.meta.creator === pkg.meta.creator &&
            p.meta.packageName === pkg.meta.packageName
        );

        if (conflictGroup.length <= 1) {
            addToast("No conflicts found for this package", "info");
            return;
        }

        const mergePlan: { keep: VarPackage, delete: VarPackage[] }[] = [];
        const resolveGroups: { id: string, packages: VarPackage[] }[] = [];

        // 2. Identify Exact Duplicates within this group
        const exactGroups = new Map<string, VarPackage[]>();
        conflictGroup.forEach(p => {
            const key = `${p.meta.version}.${p.size}`;
            if (!exactGroups.has(key)) exactGroups.set(key, []);
            exactGroups.get(key)?.push(p);
        });

        const uniqueVersions: VarPackage[] = [];

        exactGroups.forEach((dupes) => {
            if (dupes.length > 1) {
                // Sort to pick keeper
                dupes.sort((a, b) => {
                    const aPath = normalize(a.filePath);
                    const bPath = normalize(b.filePath);
                    const aParent = aPath.substring(0, Math.max(aPath.lastIndexOf('/'), aPath.lastIndexOf('\\')));
                    const bParent = bPath.substring(0, Math.max(bPath.lastIndexOf('/'), bPath.lastIndexOf('\\')));
                    const aInRoot = aParent === libPathClean;
                    const bInRoot = bParent === libPathClean;

                    if (aInRoot && !bInRoot) return -1;
                    if (!aInRoot && bInRoot) return 1;
                    if (a.isEnabled !== b.isEnabled) return a.isEnabled ? -1 : 1;
                    return 0;
                });

                const keep = dupes[0];
                const toDelete = dupes.slice(1);
                mergePlan.push({ keep, delete: toDelete });
                uniqueVersions.push(keep);
            } else {
                uniqueVersions.push(dupes[0]);
            }
        });

        // 3. Identify Version Conflicts
        if (uniqueVersions.length > 1) {
            uniqueVersions.sort((a, b) => {
                const vA = parseInt(a.meta.version) || 0;
                const vB = parseInt(b.meta.version) || 0;
                return vB - vA;
            });
            resolveGroups.push({
                id: `${pkg.meta.creator}.${pkg.meta.packageName}`,
                packages: uniqueVersions
            });
        }

        if (mergePlan.length === 0 && resolveGroups.length === 0) {
            addToast("No actionable conflicts or duplicates found.", "info");
            return;
        }

        setOptimizationData({
            open: true,
            mergePlan: mergePlan,
            resolveGroups: resolveGroups,
            targetPackage: pkg,
            forceGlobalMode: true
        });
    };

    const handleConfirmOptimization = async (enableMerge: boolean, resolutionStrategy: 'latest' | 'manual' | 'none' | 'delete-older', manualPlan: ManualPlan) => {
        setOptimizationData(prev => ({ ...prev, open: false }));
        // setLoading(true); // Don't use global loading, use Progress Modal

        const totalMerges = enableMerge ? optimizationData.mergePlan.reduce((acc, g) => acc + g.delete.length, 0) : 0;
        const totalResolves = (resolutionStrategy !== 'none') ? optimizationData.resolveGroups.length : 0;
        const totalOps = totalMerges + totalResolves;

        setOptimizationProgress({
            open: true,
            current: 0,
            total: totalOps,
            currentFile: 'Starting...',
            spaceSaved: 0,
            completed: false,
            errors: []
        });

        const errors: string[] = [];
        const deletedPaths = new Set<string>();
        let savedBytes = 0;
        let processed = 0;

        try {
            // 1. Execute Merges
            if (enableMerge && optimizationData.mergePlan.length > 0) {
                for (const group of optimizationData.mergePlan) {
                    const { keep, delete: toDelete } = group;

                    const normalize = (p: string) => p.replace(/[\\/]/g, '/').replace(/\/$/, '').toLowerCase();
                    const libPathClean = normalize(activeLibraryPath);
                    const keepPath = normalize(keep.filePath);
                    const keepParent = keepPath.substring(0, Math.max(keepPath.lastIndexOf('/'), keepPath.lastIndexOf('\\')));
                    const inRoot = keepParent === libPathClean;

                    if (!inRoot) {
                        try {
                            // Move to root simulated
                            // @ts-ignore
                            if (window.go) {
                                // @ts-ignore
                                await window.go.main.App.CopyPackagesToLibrary([keep.filePath], activeLibraryPath, false);
                                await togglePackage(keep, false, true);
                            } else {
                                console.warn("Auto-move to root not supported in web mode");
                            }
                        } catch (e: any) {
                            errors.push(`Failed to move ${keep.fileName}: ${e.message}`);
                        }
                    }

                    // Delete duplicates
                    for (const d of toDelete) {
                        setOptimizationProgress(prev => ({ ...prev, currentFile: `Deleting ${d.fileName}...` }));
                        try {
                            // @ts-ignore
                            if (window.go) {
                                // @ts-ignore
                                await window.go.main.App.DeleteFileToRecycleBin(d.filePath);
                            } else {
                                await fetch('/api/delete', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ filePath: d.filePath, libraryPath: activeLibraryPath })
                                });
                            }
                            savedBytes += d.size;
                            deletedPaths.add(d.filePath);
                        } catch (err: any) {
                            console.error("Failed to delete", d.filePath, err);
                            errors.push(`Failed to delete ${d.fileName}: ${err.message}`);
                        }
                        processed++;
                        setOptimizationProgress(prev => ({ ...prev, current: processed, spaceSaved: savedBytes }));
                    }
                }
            }

            // 2. Execute Version Resolution
            if (resolutionStrategy !== 'none' && optimizationData.resolveGroups.length > 0) {
                for (const group of optimizationData.resolveGroups) {
                    const allPkgs = group.packages.filter(p => !deletedPaths.has(p.filePath));
                    if (allPkgs.length < 2) continue; // No conflict remaining

                    let targetVersionPath = "";

                    setOptimizationProgress(prev => ({ ...prev, currentFile: `Resolving ${group.packages[0].meta.packageName}...` }));

                    if (resolutionStrategy === 'latest' || resolutionStrategy === 'delete-older') {
                        const sorted = [...allPkgs].sort((a, b) => {
                            const vA = parseInt(a.meta.version) || 0;
                            const vB = parseInt(b.meta.version) || 0;
                            return vB - vA;
                        });
                        targetVersionPath = sorted[0].filePath;
                    } else if (resolutionStrategy === 'manual') {
                        const selection = manualPlan[group.id];
                        if (selection && selection !== 'none') targetVersionPath = selection;
                    }

                    if (targetVersionPath) {
                        // Process Group
                        for (const p of allPkgs) {
                            try {
                                if (p.filePath === targetVersionPath) {
                                    // Target: Ensure Enabled
                                    if (!p.isEnabled) await togglePackage(p, true, false);
                                } else {
                                    // Non-Target: Disable or Delete
                                    if (resolutionStrategy === 'delete-older') {
                                        // DELETE
                                        // @ts-ignore
                                        if (window.go) {
                                            // @ts-ignore
                                            await window.go.main.App.DeleteFileToRecycleBin(p.filePath);
                                        } else {
                                            await fetch('/api/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filePath: p.filePath, libraryPath: activeLibraryPath }) });
                                        }
                                        savedBytes += p.size;
                                    } else {
                                        // DISABLE (Default)
                                        if (p.isEnabled) await togglePackage(p, false, false);
                                    }
                                }
                            } catch (e: any) {
                                errors.push(`Failed to process ${p.fileName}: ${e.message}`);
                            }
                        }
                    }
                    processed++;
                    setOptimizationProgress(prev => ({ ...prev, current: processed }));
                }
            }

            scanPackages();
        } catch (e: any) {
            console.error("Optimization failed", e);
            errors.push("Critical Failure: " + e.message);
        } finally {
            setLoading(false);
            setOptimizationProgress(prev => ({
                ...prev,
                completed: true,
                spaceSaved: savedBytes,
                errors: errors,
                currentFile: 'Done.'
            }));
            if (errors.length === 0) {
                addToast("Optimization Completed Successfully", 'success');
            } else {
                addToast("Optimization Completed with Errors", 'warning');
            }
        }
    };


    const handleSidebarAction = async (action: 'enable-all' | 'disable-all' | 'resolve-all' | 'install-all', groupType: 'creator' | 'type' | 'status', key: string) => {
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
                if (key === 'version-conflicts') return p.isDuplicate; // Alias
                if (key === 'exact-duplicates') return p.isExactDuplicate;
            }
            return false;
        });

        if (targets.length === 0) return;

        if (action === 'resolve-all') {
            const mergePlan: { keep: VarPackage, delete: VarPackage[] }[] = [];
            const resolveGroups: { id: string, packages: VarPackage[] }[] = [];
            let totalMergeDelete = 0;
            let totalResolveDisable = 0;

            const normalize = (p: string) => p.replace(/[\\/]/g, '/').replace(/\/$/, '').toLowerCase();
            const libPathClean = normalize(activeLibraryPath);

            // First, regroup everything by "Identity" (Creator + PackageName)
            // We need to look at ALL packages that match the identity of the target selection
            const processedIdentities = new Set<string>();

            // Collect all relevant packages from global list


            targets.forEach(t => {
                const id = `${t.meta.creator}.${t.meta.packageName}`;
                if (processedIdentities.has(id)) return;
                processedIdentities.add(id);

                // Find ALL versions/dupes globally
                const group = packages.filter(p => p.meta.creator === t.meta.creator && p.meta.packageName === t.meta.packageName);

                // Step 1: Detect Exact Duplicates
                const exactGroups = new Map<string, VarPackage[]>();
                group.forEach(p => {
                    const key = `${p.meta.version}.${p.size}`;
                    if (!exactGroups.has(key)) exactGroups.set(key, []);
                    exactGroups.get(key)?.push(p);
                });

                // For each set of exact dupes, pick a keeper and schedule others for deletion
                const uniqueVersions: VarPackage[] = []; // This will form the list for version resolution

                exactGroups.forEach((dupes) => {
                    if (dupes.length > 1) {
                        // Sort to pick keeper (Root > Enabled > First)
                        dupes.sort((a, b) => {
                            const aPath = normalize(a.filePath);
                            const bPath = normalize(b.filePath);
                            const aParent = aPath.substring(0, Math.max(aPath.lastIndexOf('/'), aPath.lastIndexOf('\\')));
                            const bParent = bPath.substring(0, Math.max(bPath.lastIndexOf('/'), bPath.lastIndexOf('\\')));
                            const aInRoot = aParent === libPathClean;
                            const bInRoot = bParent === libPathClean;

                            if (aInRoot && !bInRoot) return -1;
                            if (!aInRoot && bInRoot) return 1;
                            if (a.isEnabled !== b.isEnabled) return a.isEnabled ? -1 : 1;
                            return 0;
                        });

                        const keep = dupes[0];
                        const toDelete = dupes.slice(1);
                        mergePlan.push({ keep, delete: toDelete });
                        totalMergeDelete += toDelete.length;

                        // The 'keep' represents this version in the next step
                        uniqueVersions.push(keep);
                    } else {
                        uniqueVersions.push(dupes[0]);
                    }
                });

                // Step 2: Resolve Version Conflicts among the unique versions
                if (uniqueVersions.length > 1) {
                    // Sort by version descending (Numeric)
                    uniqueVersions.sort((a, b) => {
                        const vA = parseInt(a.meta.version) || 0;
                        const vB = parseInt(b.meta.version) || 0;
                        return vB - vA;
                    });

                    resolveGroups.push({
                        id: id,
                        packages: uniqueVersions
                    });
                    totalResolveDisable += uniqueVersions.length - 1;
                }
            });

            if (mergePlan.length === 0 && resolveGroups.length === 0) {
                addToast("No solvable issues (merges or conflicts) found", 'info');
                return;
            }

            setOptimizationData({
                open: true,
                mergePlan: mergePlan,
                resolveGroups: resolveGroups,
                forceGlobalMode: true
            });
            return;
        }

        if (action === 'install-all') {
            setInstallModal({ open: true, pkgs: targets });
            return;
        }

        if (action === 'enable-all' || action === 'disable-all') {
            setLoading(true);
            let processed = 0;
            // Filter targets that need changing
            const toToggle = targets.filter(p => action === 'enable-all' ? !p.isEnabled : p.isEnabled);

            // Initialize Progress Bar
            setScanProgress({ current: 0, total: toToggle.length });

            for (const p of toToggle) {
                // We use silent=true to avoid spamming toasts
                // We use merge=false (users should use "Merge" for handling collisions, this is just a quick toggle)
                await togglePackage(p, false, true).catch(console.error);
                processed++;
                // Update Progress Bar
                setScanProgress({ current: processed, total: toToggle.length });
            }
            setLoading(false);
            addToast(`${action === 'enable-all' ? 'Enabled' : 'Disabled'} ${processed} packages`, 'success');
            return;
        }

        scanPackages();
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
                {/* @ts-ignore */}
                {window.go && <TitleBar />}
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
        <div className="flex flex-col h-[100dvh] bg-gray-900 text-white overflow-hidden">
            {/* @ts-ignore */}
            {window.go && <TitleBar />}
            <div className="flex-1 flex overflow-hidden relative">
                <DragDropOverlay onDrop={handleDrop} onWebUpload={handleWebUpload} />



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
                    maxToasts={maxToasts}
                    setMaxToasts={(val) => {
                        setMaxToasts(val);
                        localStorage.setItem('maxToasts', val.toString());
                    }}
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

                <OptimizationModal
                    isOpen={optimizationData.open}
                    onClose={() => setOptimizationData(prev => ({ ...prev, open: false }))}
                    onConfirm={handleConfirmOptimization}
                    mergePlan={optimizationData.mergePlan}
                    resolveGroups={optimizationData.resolveGroups}
                    targetPackage={optimizationData.targetPackage}
                />

                <OptimizationProgressModal
                    isOpen={optimizationProgress.open}
                    onClose={() => setOptimizationProgress(prev => ({ ...prev, open: false }))}
                    current={optimizationProgress.current}
                    total={optimizationProgress.total}
                    currentFile={optimizationProgress.currentFile}
                    spaceSaved={optimizationProgress.spaceSaved}
                    completed={optimizationProgress.completed}
                    errors={optimizationProgress.errors}
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
                    // @ts-ignore
                    window.go ? "fixed left-0 top-8 bottom-0" : "fixed left-0 top-0 bottom-0",
                    "shadow-2xl md:shadow-none md:top-0 md:bottom-auto",
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
                    <header className="flex flex-col bg-gray-800 border-b border-gray-700 shadow-md z-30 shrink-0">
                        <div className="flex flex-col md:flex-row md:justify-between items-center p-4 gap-4 md:gap-0">

                            {/* Left Group: Toggle + Search */}
                            <div className="flex items-center gap-3 w-full md:flex-1 md:min-w-0 md:mr-8">
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
                                        className="bg-transparent outline-none w-full text-sm"
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

                            {/* Right Group: Actions (Mobile: Row below search, Desktop: Right aligned) */}
                            <div className="flex items-center justify-between w-full md:w-auto md:justify-end gap-4 shrink-0">

                                {/* Mobile-Only Group for Sorting/Tags/View */}
                                <div className="flex items-center gap-2 md:hidden">
                                    {/* Sorting */}
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
                                                    style={{ left: 0 }} // Align left on mobile
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

                                {/* Progress & Refresh (Visible on both, but style differs) */}
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
                                        onClick={scanPackages}
                                        className="hover:text-white transition-colors"
                                        title="Refresh Packages"
                                    >
                                        <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Force Restore Desktop Sorting inside Search Bar logic? 
                            I'll modify the Search Bar block above in a 2nd pass or do it all here. 
                            I'll inject the Desktop Sorting Button back into the search bar container, visible only on md.
                        */}

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
                            {/* CardGrid Container - Added padding bottom for absolute footer */}
                            <div className="flex-1 overflow-auto p-4 pb-24 custom-scrollbar">
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

                            {/* Pagination Footer - Premium Glassmorphism Floating Bar */}
                            {filteredPkgs.length > itemsPerPage && (
                                <div className="absolute bottom-0 left-0 right-0 p-3 bg-gray-900/80 backdrop-blur-md border-t border-white/10 z-20 shadow-[0_-4px_20px_rgba(0,0,0,0.5)]">
                                    <Pagination
                                        currentPage={currentPage}
                                        totalItems={filteredPkgs.length}
                                        itemsPerPage={itemsPerPage}
                                        onChange={setCurrentPage}
                                    />
                                </div>
                            )}
                        </div>

                        <AnimatePresence>
                            {(selectedPackage && selectedIds.size === 1 && isDetailsPanelOpen) && (
                                <RightSidebar
                                    pkg={selectedPackage}
                                    onClose={() => { setIsDetailsPanelOpen(false); setSelectedPackage(null); setSelectedIds(new Set()); }}
                                    onResolve={handleSingleResolve}
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
                        onToggle={handleBulkToggle}
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
                        onMerge={(pkg) => handleInstantMerge(pkg, false)}
                        onMergeInPlace={(pkg) => handleInstantMerge(pkg, true)}
                        onResolve={handleSingleResolve}
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
            <InstallPackageModal
                isOpen={installModal.open}
                onClose={() => setInstallModal({ open: false, pkgs: [] })}
                packages={installModal.pkgs}
                libraries={libraries}
                currentLibrary={activeLibraryPath}
                onSuccess={(result) => {
                    const idx = libraries.indexOf(result.targetLib);
                    if (idx !== -1) handleSwitchLibrary(idx);
                    setInstallModal({ open: false, pkgs: [] });
                }}
            />

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
