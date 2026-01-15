import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { X, Upload, Trash2, File as FileIcon, RefreshCw, Folder, ChevronDown, CheckCircle, AlertOctagon } from 'lucide-react';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';

interface UploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialFiles: (string | File)[]; // Path (Desktop) or File (Web)
    onAppendFiles: (files: (string | File)[]) => void;
    libraries: string[];
    initialLibrary: string; // Default lib
    onSuccess: () => void;
}

const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const UploadModal = ({ isOpen, onClose, initialFiles, onAppendFiles, libraries, initialLibrary, onSuccess }: UploadModalProps) => {

    interface StagedFile {
        id: string; // Unique ID
        original: string | File;
        name: string;
        size: number;
        status: 'pending' | 'uploading' | 'done' | 'error';
        isDuplicate?: boolean;
    }

    const [queue, setQueue] = useState<StagedFile[]>([]);
    const [loading, setLoading] = useState(false);

    // Destination Picker
    const [selectedLib, setSelectedLib] = useState(initialLibrary);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const [diskSpace, setDiskSpace] = useState<{ free: number, total: number } | null>(null);
    const [isCheckingSpace, setIsCheckingSpace] = useState(false);

    const [installProgress, setInstallProgress] = useState<{ current: number, total: number } | null>(null);

    // Sync selectedLib on Open & Clear Queue
    useEffect(() => {
        if (isOpen) {
            setQueue([]); // Clear previous queue (except if initialFiles catches up later)
            setInstallProgress(null); // Reset progress

            if (initialLibrary) {
                setSelectedLib(initialLibrary);
            } else if (libraries.length > 0 && !selectedLib) {
                // Fallback to first library if active is empty
                setSelectedLib(libraries[0]);
            }
        }
    }, [isOpen, initialLibrary, libraries]);

    // Close Dropdown on Click Outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Check Space & Collisions
    const checkContext = async () => {
        if (!isOpen || !selectedLib) return;
        setIsCheckingSpace(true);
        setDiskSpace(null);

        try {
            // 1. Check Spaces
            // @ts-ignore
            if (window.go) {
                // @ts-ignore
                const info = await window.go.main.App.GetDiskSpace(selectedLib);
                setDiskSpace(info);
            } else {
                const res = await fetch(`/api/disk-space?path=${encodeURIComponent(selectedLib)}`);
                if (res.ok) setDiskSpace(await res.json());
            }

            // 2. Check Collisions (Light Scan)
            if (queue.length > 0) {
                const fileNames = queue.map(f => f.name);
                let collisions: string[] = [];

                // @ts-ignore
                if (window.go) {
                    // @ts-ignore
                    collisions = await window.go.main.App.CheckCollisions(fileNames, selectedLib);
                } else {
                    const res = await fetch("/api/scan/collisions", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ files: fileNames, path: selectedLib })
                    });
                    if (res.ok) {
                        const data = await res.json();
                        collisions = data.collisions || [];
                    }
                }
                if (collisions && collisions.length > 0) {
                    setQueue(prev => prev.map(f => ({
                        ...f,
                        isDuplicate: collisions.includes(f.name)
                    })));
                } else {
                    setQueue(prev => prev.map(f => ({ ...f, isDuplicate: false })));
                }
            }

        } catch (e) {
            console.error("Context check failed", e);
        } finally {
            setIsCheckingSpace(false);
        }
    };

    // Trigger check on dependency change
    useEffect(() => {
        checkContext();
    }, [isOpen, selectedLib, queue.length]);

    // Helper to add files to queue
    const addFilesToQueue = useCallback((files: (string | File)[]) => {
        if (files.length === 0) return;

        setQueue(prev => {
            const newFiles = files.map(f => {
                const isFileObj = f instanceof File;
                const id = isFileObj ? (f as File).name + (f as File).size : (f as string);

                // Skip duplicates within queue
                if (prev.find(q => q.id === id)) return null;

                return {
                    id,
                    original: f,
                    name: isFileObj ? (f as File).name : (f as string).split(/[/\\]/).pop() || (f as string),
                    size: isFileObj ? (f as File).size : 0,
                    status: 'pending' as const,
                    isDuplicate: false
                };
            }).filter(Boolean) as StagedFile[];

            return [...prev, ...newFiles];
        });
    }, []);

    // Listen to initial internal drops (passed via props)
    useEffect(() => {
        if (initialFiles.length > 0) {
            addFilesToQueue(initialFiles);
            onAppendFiles([]); // Clear parent buffer
        }
    }, [initialFiles, addFilesToQueue, onAppendFiles]);

    // Calculated Stats
    const totalSize = useMemo(() => queue.reduce((acc, f) => acc + f.size, 0), [queue]);
    const duplicateCount = useMemo(() => queue.filter(f => f.isDuplicate).length, [queue]);
    const validCount = queue.length - duplicateCount;

    // Safety Checks
    const isSpaceCritical = diskSpace ? (diskSpace.free < totalSize) : true;
    const isSpaceUnavailable = !diskSpace;
    const canInstall = !isSpaceUnavailable && !isSpaceCritical && validCount > 0;

    const handleInstall = async () => {
        if (!canInstall || !selectedLib) return;
        setLoading(true);

        const toInstall = queue.filter(f => !f.isDuplicate);
        setInstallProgress({ current: 0, total: toInstall.length });

        // Desktop Mode: Bulk Install (Wails handles concurrency efficiently for local files)
        // @ts-ignore
        if (window.go) {
            const onProgress = (data: any) => {
                if (data.detail) data = data.detail;
                setInstallProgress(data);
            };

            // @ts-ignore
            if (window.runtime) window.runtime.EventsOn('scan:progress', onProgress);

            try {
                const paths = toInstall.map(f => f.original as string);
                // @ts-ignore
                await window.go.main.App.InstallFiles(paths, selectedLib);
                onSuccess();
                onClose();
            } catch (e: any) {
                let msg = e.message || "Unknown error";
                alert("Install failed: " + msg);
            } finally {
                setLoading(false);
                // @ts-ignore
                if (window.runtime) window.runtime.EventsOff('scan:progress');
            }
            return;
        }

        // Web Mode: Sequential Uploads
        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < toInstall.length; i++) {
            const f = toInstall[i];

            try {
                // Update local status (optional: could update queue state to show spinner on item)
                setQueue(prev => prev.map(q => q.id === f.id ? { ...q, status: 'uploading' } : q));

                const formData = new FormData();
                formData.append('path', selectedLib);
                if (f.original instanceof File) {
                    formData.append("file", f.original);
                } else {
                    // Should not happen in web mode normally unless hybrid?
                    console.warn("Skipping non-file object in web mode:", f.name);
                    continue;
                }

                // Upload
                const res = await fetch("/api/upload", { method: 'POST', body: formData });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);

                const data = await res.json();
                if (!data.success) throw new Error(data.error || "Unknown error");

                successCount++;
                setQueue(prev => prev.map(q => q.id === f.id ? { ...q, status: 'done' } : q));

            } catch (e) {
                console.error(`Failed to upload ${f.name}:`, e);
                failCount++;
                setQueue(prev => prev.map(q => q.id === f.id ? { ...q, status: 'error' } : q));
                // We continue to next file
            }

            // Update Progress Bar
            setInstallProgress({ current: i + 1, total: toInstall.length });
        }

        setLoading(false);

        // Final Report
        if (failCount === 0) {
            // All good
            onSuccess(); // Triggers refresh
            onClose();
        } else {
            // Some failed
            alert(`Upload completed with errors.\nInstalled: ${successCount}\nFailed: ${failCount}`);
            onSuccess(); // Refresh anyway to show successes
            // Keep modal open? Or close? 
            // If we close, user loses 'error' status visibility on items.
            // But we refreshed the background.
            // Let's close for now to keep it simple, or user can assume red items failed.
            onClose();
        }
    };

    const removeFile = (id: string) => {
        setQueue(prev => prev.filter(f => f.id !== id));
    };

    if (!isOpen) return null;

    const getLibName = (path: string) => path.split(/[/\\]/).pop() || path;

    return (
        <AnimatePresence>
            <div
                className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]"
                    onClick={(e) => e.stopPropagation()} // Prevent clicks passthrough
                >
                    {/* Header */}
                    <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900/50">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <Upload size={20} className="text-blue-400" />
                            Upload to Library
                        </h2>
                        {!loading && (
                            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                                <X size={20} />
                            </button>
                        )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-hidden flex flex-col p-4 space-y-4">

                        {/* Unified Location Control Bar */}
                        <div className="flex bg-gray-900/50 border border-gray-700 rounded-lg overflow-visible" ref={dropdownRef}>
                            {/* Library Selector */}
                            <div className="flex-1 border-r border-gray-700 relative">
                                <div
                                    onClick={() => !loading && setIsDropdownOpen(!isDropdownOpen)}
                                    className={clsx(
                                        "w-full h-full p-3 flex items-center gap-3 cursor-pointer hover:bg-white/5 transition-colors relative",
                                        loading && "opacity-50 cursor-not-allowed"
                                    )}
                                >
                                    <div className="p-2 bg-blue-500/20 text-blue-400 rounded-lg shrink-0">
                                        <Folder size={20} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-white truncate">{getLibName(selectedLib)}</span>
                                            <ChevronDown size={14} className={clsx("text-gray-500 transition-transform", isDropdownOpen && "rotate-180")} />
                                        </div>
                                        <div className="text-xs text-gray-500 truncate">{selectedLib}</div>
                                    </div>
                                </div>

                                {/* Dropdown Menu */}
                                {isDropdownOpen && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-20 max-h-48 overflow-y-auto custom-scrollbar">
                                        {libraries.map(lib => (
                                            <div
                                                key={lib}
                                                onClick={() => {
                                                    setSelectedLib(lib);
                                                    setIsDropdownOpen(false);
                                                }}
                                                className="p-3 hover:bg-gray-700 cursor-pointer flex items-center gap-3"
                                            >
                                                <Folder size={16} className={lib.replace(/\\/g, '/').toLowerCase() === selectedLib.replace(/\\/g, '/').toLowerCase() ? "text-blue-400" : "text-gray-500"} />
                                                <div className="min-w-0">
                                                    <div className={clsx("text-sm font-medium", lib.replace(/\\/g, '/').toLowerCase() === selectedLib.replace(/\\/g, '/').toLowerCase() ? "text-white" : "text-gray-300")}>
                                                        {getLibName(lib)}
                                                    </div>
                                                    <div className="text-xs text-gray-500 truncate">{lib}</div>
                                                </div>
                                                {lib.replace(/\\/g, '/').toLowerCase() === selectedLib.replace(/\\/g, '/').toLowerCase() && <CheckCircle size={14} className="text-blue-400 ml-auto" />}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Space Info Section */}
                            <div className="w-40 p-3 flex flex-col justify-center bg-gray-900/30">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Storage</span>
                                    <button onClick={checkContext} disabled={loading} className="text-gray-500 hover:text-white" title="Refresh">
                                        <RefreshCw size={12} className={isCheckingSpace ? "animate-spin" : ""} />
                                    </button>
                                </div>
                                <div className={clsx(
                                    "text-sm font-bold truncate flex items-center gap-2",
                                    !diskSpace ? "text-red-400" :
                                        (diskSpace.free < totalSize) ? "text-red-500" : "text-green-400"
                                )}>
                                    {!diskSpace ? "Unavailable" : formatBytes(diskSpace.free)}
                                </div>
                                {isSpaceCritical && diskSpace && (
                                    <div className="text-[10px] text-red-400 mt-1 leading-tight flex items-center gap-1">
                                        <AlertOctagon size={10} /> Full
                                    </div>
                                )}
                            </div>
                        </div>


                        {/* Staging List */}
                        <div className="flex-1 bg-gray-900/50 rounded-lg border border-gray-700 overflow-y-auto custom-scrollbar p-2 space-y-1 relative">
                            {queue.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-gray-500 border-2 border-dashed border-gray-700 rounded-lg m-2">
                                    <Upload size={32} className="mb-2 opacity-50" />
                                    <p>Drop more files here</p>
                                </div>
                            ) : (
                                queue.map((f) => (
                                    <div
                                        key={f.id}
                                        className={clsx(
                                            "flex items-center justify-between p-2 rounded border transition-colors group",
                                            f.isDuplicate ? "bg-yellow-500/10 border-yellow-500/30" : "bg-gray-800/50 border-gray-700/50 hover:border-gray-600"
                                        )}
                                    >
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <FileIcon size={16} className={f.isDuplicate ? "text-yellow-500" : "text-blue-400"} />
                                            <div className="min-w-0">
                                                <p className={clsx("text-sm truncate", f.isDuplicate ? "text-yellow-200/70" : "text-gray-200")} title={f.name}>
                                                    {f.name}
                                                </p>
                                                <div className="flex gap-2 text-[10px] text-gray-500">
                                                    {f.size > 0 && <span>{formatBytes(f.size)}</span>}
                                                    {f.isDuplicate && <span className="text-yellow-500 font-bold uppercase tracking-wider">Skip</span>}
                                                </div>
                                            </div>
                                        </div>

                                        {!f.isDuplicate && (
                                            <button
                                                onClick={() => removeFile(f.id)}
                                                className="text-gray-500 hover:text-red-400 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Queue Stats */}
                        <div className="flex justify-between items-center text-xs text-gray-500 px-1">
                            <span>{validCount} files to install {duplicateCount > 0 && `(${duplicateCount} skipped)`}</span>
                            <span>Total Size: {formatBytes(totalSize)}</span>
                        </div>
                    </div>

                    {/* Footer Actions */}
                    {loading ? (
                        <div className="p-4 bg-gray-900/80 border-t border-gray-700">
                            <div className="space-y-2">
                                <div className="flex justify-between text-xs text-gray-400 uppercase font-bold tracking-wider">
                                    <span>Installing...</span>
                                    <span>{installProgress ? Math.round((installProgress.current / installProgress.total) * 100) : 0}%</span>
                                </div>
                                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-blue-500 transition-all duration-300 ease-out"
                                        style={{ width: `${installProgress ? (installProgress.current / installProgress.total) * 100 : 0}%` }}
                                    />
                                </div>
                                <p className="text-center text-xs text-gray-500">
                                    {installProgress?.current} / {installProgress?.total} processed
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="p-4 border-t border-gray-700 bg-gray-900/50 flex justify-end gap-3">
                            <button
                                onClick={handleInstall}
                                disabled={!canInstall}
                                className={clsx(
                                    "w-full py-3 rounded-lg font-bold text-shadow transition-all shadow-lg flex items-center justify-center gap-2",
                                    !canInstall
                                        ? "bg-gray-700 text-gray-500 cursor-not-allowed opacity-50"
                                        : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-900/20"
                                )}
                            >
                                {isSpaceUnavailable ? "Library Unavailable" :
                                    isSpaceCritical ? "Insufficient Disk Space" :
                                        `Install ${validCount} Packages`}
                            </button>
                        </div>
                    )}
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
