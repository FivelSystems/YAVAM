import { useState, useMemo, useEffect } from 'react';
import { X, Download, Library, CheckCircle, Loader2, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import { VarPackage } from '../../types';
import { resolveRecursive } from '../../utils/dependency';

interface InstallPackageModalProps {
    isOpen: boolean;
    onClose: () => void;
    packages: VarPackage[];
    allPackages: VarPackage[];
    libraries: string[];
    currentLibrary: string; // To visually distinguishing or filtering
    onSuccess: (result: { installed: number, skipped: number, targetLib: string }) => void;
}

const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const InstallPackageModal = ({ isOpen, onClose, packages, allPackages, libraries, currentLibrary, onSuccess }: InstallPackageModalProps) => {
    const [selectedLib, setSelectedLib] = useState<string | null>(null);
    const [overwrite, setOverwrite] = useState(false);
    const [includeDeps, setIncludeDeps] = useState(false);
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState<{ current: number, total: number, filename: string } | null>(null);
    const [installResult, setInstallResult] = useState<{ installed: number, skipped: number, errors: any[] } | null>(null);

    const [statusHistory, setStatusHistory] = useState<Record<string, string>>({});

    // Disk Space State
    const [librarySpaces, setLibrarySpaces] = useState<Record<string, { free: number, total: number } | null>>({});
    const [checkingSpaces, setCheckingSpaces] = useState(false);
    const [isDestinationsOpen, setIsDestinationsOpen] = useState(true);

    // Reset state when modal opens
    useMemo(() => {
        if (isOpen) {
            setInstallResult(null);
            setProgress(null);
            setStatusHistory({});
            setLoading(false);
            setIncludeDeps(false); // Default to false
        }
    }, [isOpen]);

    // Resolve Dependencies Logic
    const resolvedPackages = useMemo(() => {
        if (!isOpen) return [];

        if (!includeDeps) {
            // Simple Dedupe
            const seen = new Set();
            return packages.filter(p => {
                if (seen.has(p.fileName)) return false;
                seen.add(p.fileName);
                return true;
            });
        }

        // Recursive Resolution via Shared Utility
        return resolveRecursive(packages, allPackages);
    }, [packages, includeDeps, allPackages, isOpen]);


    // Calculate required space using RESOLVED list
    const requiredSpace = useMemo(() => resolvedPackages.reduce((acc, p) => acc + p.size, 0), [resolvedPackages]);
    const addedDepsCount = Math.max(0, resolvedPackages.length - packages.length);

    const availableLibraries = useMemo(() => {
        return libraries.filter(l => l.toLowerCase() !== currentLibrary.toLowerCase());
    }, [libraries, currentLibrary]);

    // Check Disk Space for ALL libraries when modal opens
    useEffect(() => {
        if (!isOpen) return;

        const checkAllSpaces = async () => {
            setCheckingSpaces(true);
            const spaces: Record<string, { free: number, total: number } | null> = {};

            // Parallelize requests
            await Promise.all(libraries.map(async (lib) => {
                try {
                    // @ts-ignore
                    if (window.go) {
                        // @ts-ignore
                        const info = await window.go.main.App.GetDiskSpace(lib);
                        spaces[lib] = info;
                    } else {
                        // Web Mock
                        const res = await fetch(`/api/disk-space?path=${encodeURIComponent(lib)}`);
                        const data = await res.json();
                        spaces[lib] = data;
                    }
                } catch (e) {
                    console.error(`Failed to check space for ${lib}`, e);
                    spaces[lib] = null;
                }
            }));

            setLibrarySpaces(spaces);
            setCheckingSpaces(false);
        };

        checkAllSpaces();
    }, [isOpen, libraries]);

    const selectedLibSpace = selectedLib ? librarySpaces[selectedLib] : null;
    const hasInsufficientSpace = selectedLibSpace ? selectedLibSpace.free < requiredSpace : false;

    const handleInstall = async () => {
        if (!selectedLib) return;
        setLoading(true);
        setProgress(null);
        setStatusHistory({});

        // Setup Wails Event Listener
        let cleanupEvents: (() => void) | null = null;

        // @ts-ignore
        if (window.runtime) {
            // @ts-ignore
            cleanupEvents = window.runtime.EventsOn("install-progress", (data: any) => {
                setProgress(data);
                if (data.status) {
                    setStatusHistory(prev => ({ ...prev, [data.filename]: data.status }));
                }
            });
        } else {
            // Web Mode - Listen for Custom Events dispatched by App.tsx from SSE
            const handler = (e: any) => {
                const data = e.detail;
                if (data) {
                    setProgress(data);
                    if (data.status) {
                        setStatusHistory(prev => ({ ...prev, [data.filename]: data.status }));
                    }
                }
            };
            window.addEventListener('install-progress', handler);
            cleanupEvents = () => window.removeEventListener('install-progress', handler);
        }

        try {
            const paths = resolvedPackages.map(p => p.filePath);
            const total = paths.length;
            let installedCount = total;
            let skippedCount = 0;

            // @ts-ignore
            if (window.go) {
                // Desktop Mode
                // @ts-ignore
                // CopyPackagesToLibrary handles the copy. If overwrite is false, it returns collisions (skipped).
                const collisions: string[] = await window.go.main.App.CopyPackagesToLibrary(paths, selectedLib, overwrite);

                if (!overwrite && collisions && collisions.length > 0) {
                    skippedCount = collisions.length;
                    installedCount = total - skippedCount;
                }
            } else {
                // Web Mode
                const res = await fetch("/api/install", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        filePaths: paths,
                        destLib: selectedLib,
                        overwrite: overwrite
                    })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.message || "Install failed");

                if (!overwrite && data.collisions && data.collisions.length > 0) {
                    skippedCount = data.collisions.length;
                    installedCount = total - skippedCount;
                }
            }

            if (cleanupEvents) cleanupEvents(); // Unsubscribe
            setLoading(false);
            setInstallResult({ installed: installedCount, skipped: skippedCount, errors: [] });

        } catch (e: any) {
            console.error(e);
            setLoading(false);
            if (cleanupEvents) cleanupEvents();
        }
    };

    if (!isOpen) return null;

    // Derived errors/skips from history for the summary result
    const completedSkips = Object.entries(statusHistory).filter(([_, s]) => s === 'skipped').map(([name]) => name);
    const completedErrors = Object.entries(statusHistory).filter(([_, s]) => s === 'error').map(([name]) => name);

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
                >
                    {/* Header */}
                    <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900/50">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <Download size={20} className="text-blue-400" />
                            Install to {selectedLib ? selectedLib.split(/[/\\]/).pop() : "Library"}
                        </h2>
                        {!loading && !installResult && (
                            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                                <X size={20} />
                            </button>
                        )}
                    </div>

                    {/* Content */}
                    <div className="p-6 flex-1 flex flex-col min-h-0">
                        {installResult ? (
                            <div className="flex flex-col items-center space-y-6 text-center overflow-y-auto custom-scrollbar pr-2">
                                {/* Result Summary (Same as before) */}
                                <div className="w-16 h-16 bg-blue-500/20 text-blue-400 rounded-full flex items-center justify-center mb-2">
                                    <CheckCircle size={32} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-white">Installation Complete</h3>
                                    <p className="text-gray-400 mt-1">
                                        Processed {resolvedPackages.length} packages
                                    </p>
                                </div>

                                <div className="grid grid-cols-3 gap-3 w-full">
                                    <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                                        <div className="text-2xl font-bold text-green-400">{installResult.installed}</div>
                                        <div className="text-xs text-green-300/70 uppercase tracking-wider font-medium">Installed</div>
                                    </div>
                                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                                        <div className="text-2xl font-bold text-yellow-400">{completedSkips.length}</div>
                                        <div className="text-xs text-yellow-300/70 uppercase tracking-wider font-medium">Skipped</div>
                                    </div>
                                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                                        <div className="text-2xl font-bold text-red-400">{completedErrors.length}</div>
                                        <div className="text-xs text-red-300/70 uppercase tracking-wider font-medium">Errors</div>
                                    </div>
                                </div>

                                {(completedSkips.length > 0 || completedErrors.length > 0) && (
                                    <div className="w-full text-left space-y-2 mt-4">
                                        <p className="text-sm font-medium text-gray-300">Details:</p>
                                        <div className="max-h-40 overflow-y-auto bg-gray-900/50 rounded-lg p-3 border border-gray-700 text-sm space-y-1">
                                            {completedErrors.map(name => (
                                                <div key={name} className="flex items-center gap-2 text-red-400">
                                                    <AlertTriangle size={12} />
                                                    <span>{name} (Error)</span>
                                                </div>
                                            ))}
                                            {completedSkips.map(name => (
                                                <div key={name} className="flex items-center gap-2 text-yellow-400">
                                                    <AlertTriangle size={12} />
                                                    <span>{name} (Skipped - Exists)</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : loading ? (
                            <div className="flex flex-col h-full justify-center items-center py-4 space-y-6">
                                {/* Percentage Display - Compact */}
                                <div className="text-center space-y-1">
                                    <div className="text-4xl font-bold text-white tabular-nums tracking-tight">
                                        {progress ? Math.round((progress.current / progress.total) * 100) : 0}%
                                    </div>
                                    <h3 className="text-gray-500 font-medium text-xs uppercase tracking-wider">Complete</h3>
                                </div>

                                {/* Main Progress Bar */}
                                <div className="w-full max-w-xs space-y-2">
                                    <div className="h-2 bg-gray-700/50 rounded-full overflow-hidden shadow-inner">
                                        <div
                                            className="h-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.4)] transition-all duration-300 ease-out"
                                            style={{ width: `${progress ? (progress.current / progress.total) * 100 : 0}%` }}
                                        />
                                    </div>

                                    {/* Counts */}
                                    <div className="flex justify-between text-xs font-medium text-gray-500 px-1">
                                        <span>{progress?.current || 0} / {progress?.total || resolvedPackages.length}</span>
                                        <span>{progress ? progress.total - progress.current : 0} left</span>
                                    </div>
                                </div>

                                {/* Current File Status */}
                                <div className="w-full max-w-xs bg-gray-900/50 rounded-lg border border-gray-700/50 p-3 flex items-center gap-3">
                                    <div className="shrink-0">
                                        <Loader2 className="text-blue-400 animate-spin" size={16} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs text-gray-300 font-medium truncate" title={progress?.filename}>
                                            {progress?.filename || "Preparing..."}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-6 overflow-y-auto custom-scrollbar pr-2 pb-2">
                                {/* Source Summary & Required Space */}
                                <div className="bg-gray-900/50 rounded-lg border border-gray-700/50 p-4 flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-blue-500/20 text-blue-400 rounded-lg">
                                            <Library size={20} />
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-400">Source Selection</p>
                                            <div className="flex items-baseline gap-2">
                                                <p className="text-white font-medium">{resolvedPackages.length} Packages</p>
                                                {addedDepsCount > 0 && (
                                                    <span className="text-xs text-blue-400">(+{addedDepsCount} deps)</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="h-8 w-px bg-gray-700/50" />

                                    <div className="flex items-center gap-3 text-right">
                                        <div>
                                            <p className="text-sm text-gray-400">Required Space</p>
                                            <p className={clsx("font-medium", hasInsufficientSpace ? "text-red-400" : "text-white")}>
                                                {formatBytes(requiredSpace)}
                                            </p>
                                        </div>
                                        <div className="p-2 bg-gray-700/50 text-gray-400 rounded-lg">
                                            <Download size={20} />
                                        </div>
                                    </div>
                                </div>

                                {/* Dependency Options */}
                                <div className="flex justify-end pt-1 pb-2 px-1">
                                    <label
                                        className="flex items-center gap-2 cursor-pointer group select-none"
                                        title="Recursively find and include all required packages."
                                    >
                                        <div className="relative flex items-center">
                                            <input
                                                type="checkbox"
                                                className="peer sr-only"
                                                checked={includeDeps}
                                                onChange={(e) => setIncludeDeps(e.target.checked)}
                                            />
                                            <div className="w-4 h-4 border-2 border-gray-500 rounded peer-checked:bg-purple-500 peer-checked:border-purple-500 transition-colors"></div>
                                            <CheckCircle size={12} className="absolute inset-0 m-auto text-white opacity-0 peer-checked:opacity-100 pointer-events-none" />
                                        </div>
                                        <span className="text-xs font-medium text-gray-400 group-hover:text-gray-200 transition-colors">Include Dependencies</span>
                                    </label>
                                </div>

                                {/* Destination Selector - Foldable */}
                                <div className="space-y-2">
                                    <button
                                        onClick={() => setIsDestinationsOpen(!isDestinationsOpen)}
                                        className="w-full flex items-center justify-between text-sm font-medium text-gray-300 hover:text-white transition-colors"
                                    >
                                        <span>Select Destination Library</span>
                                        {isDestinationsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    </button>

                                    {isDestinationsOpen && (
                                        <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                                            {availableLibraries.length === 0 ? (
                                                <div className="text-center p-4 text-gray-500 italic bg-gray-900/30 rounded border border-gray-700 border-dashed">
                                                    No other libraries configured.
                                                </div>
                                            ) : [...availableLibraries].sort((a, b) => {
                                                const spaceA = librarySpaces[a];
                                                const spaceB = librarySpaces[b];
                                                // Check against NEW requiredSpace
                                                const notEnoughA = spaceA ? spaceA.free < requiredSpace : false;
                                                const notEnoughB = spaceB ? spaceB.free < requiredSpace : false;
                                                // Sort: Valid first (false < true)
                                                return Number(notEnoughA) - Number(notEnoughB);
                                            }).map(lib => {
                                                const space = librarySpaces[lib];
                                                const notEnough = space ? space.free < requiredSpace : false;
                                                const isChecking = checkingSpaces && !space;

                                                return (
                                                    <button
                                                        key={lib}
                                                        onClick={() => !notEnough && setSelectedLib(lib)}
                                                        disabled={notEnough}
                                                        className={clsx(
                                                            "w-full text-left px-4 py-3 rounded-lg border transition-all flex items-center justify-between group relative overflow-hidden",
                                                            selectedLib === lib
                                                                ? "bg-blue-600/20 border-blue-500 text-white shadow-[0_0_15px_rgba(37,99,235,0.2)]"
                                                                : notEnough
                                                                    ? "bg-red-900/10 border-red-900/20 text-gray-500 cursor-not-allowed opacity-80"
                                                                    : "bg-gray-700/50 border-gray-700 text-gray-300 hover:bg-gray-700 hover:border-gray-600"
                                                        )}
                                                    >
                                                        <div className="flex flex-col overflow-hidden z-10">
                                                            <div className="flex items-center gap-2">
                                                                <span className={clsx("font-medium truncate", notEnough && "text-red-400/80")}>
                                                                    {lib.split(/[/\\]/).pop()}
                                                                </span>
                                                                {notEnough && (
                                                                    <span className="text-[10px] font-bold text-red-500 uppercase tracking-wider bg-red-500/10 px-1.5 py-0.5 rounded">
                                                                        Insufficient Space
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <span className="text-[10px] text-gray-500 truncate">{lib}</span>
                                                        </div>

                                                        <div className="flex items-center gap-3 z-10">
                                                            {/* Resulting Space Info */}
                                                            <div className="text-right">
                                                                {isChecking ? (
                                                                    <Loader2 size={12} className="animate-spin text-gray-500" />
                                                                ) : space ? (
                                                                    <>
                                                                        <span className={clsx("text-xs font-medium block", notEnough ? "text-red-500" : "text-gray-400")}>
                                                                            {formatBytes(space.free)} Free
                                                                        </span>
                                                                    </>
                                                                ) : (
                                                                    <span className="text-xs text-gray-600">Unavailable</span>
                                                                )}
                                                            </div>

                                                            {selectedLib === lib ? (
                                                                <CheckCircle size={16} className="text-blue-400 shrink-0" />
                                                            ) : (
                                                                <div className="w-4" />
                                                            )}
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* Options - Show only when library selected */}
                                {selectedLib && (
                                    <div className="flex justify-end">
                                        <label
                                            className="flex items-center gap-2 cursor-pointer group select-none"
                                            title="If unchecked, existing files will be skipped to save time."
                                        >
                                            <div className="relative flex items-center">
                                                <input
                                                    type="checkbox"
                                                    className="peer sr-only"
                                                    checked={overwrite}
                                                    onChange={e => setOverwrite(e.target.checked)}
                                                />
                                                <div className="w-4 h-4 border-2 border-gray-500 rounded peer-checked:bg-blue-500 peer-checked:border-blue-500 transition-colors"></div>
                                                <CheckCircle size={12} className="absolute inset-0 m-auto text-white opacity-0 peer-checked:opacity-100 pointer-events-none" />
                                            </div>
                                            <span className="text-xs font-medium text-gray-400 group-hover:text-gray-200 transition-colors">Overwrite Existing</span>
                                        </label>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Footer - HIDE when loading/installing */}
                    {!loading && (
                        <div className="p-4 border-t border-gray-700 bg-gray-900/50 flex gap-3">
                            {installResult ? (
                                <button
                                    onClick={() => {
                                        onSuccess({ installed: installResult.installed, skipped: installResult.skipped, targetLib: selectedLib! });
                                        onClose();
                                    }}
                                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors shadow-blue-900/20"
                                >
                                    Done
                                </button>
                            ) : (
                                <button
                                    onClick={handleInstall}
                                    disabled={!selectedLib || loading || hasInsufficientSpace}
                                    className={clsx(
                                        "w-full py-2.5 rounded-lg font-medium transition-all shadow-lg flex items-center justify-center gap-2",
                                        !selectedLib || loading || hasInsufficientSpace
                                            ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                                            : "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/20"
                                    )}
                                >
                                    {loading ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                                    {loading ? "Installing..." : "Install Packages"}
                                </button>
                            )}
                        </div>
                    )}
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
