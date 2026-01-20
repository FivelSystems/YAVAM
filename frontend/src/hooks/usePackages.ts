import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { VarPackage } from '../types';
import { fetchWithAuth } from '../services/api';
import { analyzeGraph } from '../utils/packageDependencyAnalysis';
import { PACKAGES } from '../constants';


interface ScanProgress {
    current: number;
    total: number;
}

export const usePackages = (activeLibraryPath: string) => {
    const [packages, setPackages] = useState<VarPackage[]>([]);
    const [filteredPkgs, setFilteredPkgs] = useState<VarPackage[]>([]); // This might move to useFilters later, but for now scanPackages clears it.
    const [availableTags, setAvailableTags] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const loadingRef = useRef(false); // Track loading synchronously
    useEffect(() => { loadingRef.current = loading; }, [loading]);

    const [scanProgress, setScanProgress] = useState<ScanProgress>({ current: 0, total: 0 });
    const scanSessionId = useRef(0);
    const scanAbortController = useRef<AbortController | null>(null);
    const [isCancelling, setIsCancelling] = useState(false);
    const knownPathsRef = useRef(new Set<string>()); // Sync tracker for buffer

    // Cancel Scan Function (Moved Up)
    const cancelScan = useCallback(async (options: { resetLoading?: boolean } = {}) => {
        const { resetLoading = true } = options;
        if (!loadingRef.current) return;

        setIsCancelling(true);


        if (scanAbortController.current) scanAbortController.current.abort();

        if (window.go) {
            await window.go.main.App.CancelScan();
        }

        if (resetLoading) {
            setLoading(false);
        }
        setIsCancelling(false);
    }, []);

    // Helper: Analyze Packages (Moved from Dashboard)
    const analyzePackages = useCallback((pkgs: VarPackage[]): VarPackage[] => {

        // 1. Build Index and Group by "Creator.Package"
        const pkgIds = new Set<string>();
        const groups = new Map<string, VarPackage[]>();

        pkgs.forEach(p => {
            if (p.isCorrupt) return;
            if (p.meta && p.meta.creator && p.meta.packageName) {
                const id = `${p.meta.creator}.${p.meta.packageName}.${p.meta.version}`;
                pkgIds.add(id);

                const groupKey = `${p.meta.creator}.${p.meta.packageName}`;
                if (!groups.has(groupKey)) groups.set(groupKey, []);
                groups.get(groupKey)?.push(p);
            }
        });

        // 2. Identify Obsolete vs Redundant Packages
        const obsoletePaths = new Map<string, string>();
        const redundantPaths = new Map<string, string>();

        groups.forEach((groupPkgs) => {
            if (groupPkgs.length > 1) {
                // Helper to normalize version to Int
                // Robust Version Comparator
                const compareVersions = (v1: string, v2: string) => {
                    if (v1 === v2) return 0;
                    const parts1 = v1.split('.').map(p => parseInt(p, 10));
                    const parts2 = v2.split('.').map(p => parseInt(p, 10));

                    const len = Math.max(parts1.length, parts2.length);
                    for (let i = 0; i < len; i++) {
                        const n1 = parts1[i] || 0;
                        const n2 = parts2[i] || 0;
                        if (n1 > n2) return 1;
                        if (n1 < n2) return -1;
                    }
                    return 0;
                };

                groupPkgs.sort((a, b) => {
                    // 1. Prioritize Enabled Packages (Active beats Disabled)
                    if (a.isEnabled && !b.isEnabled) return -1;
                    if (!a.isEnabled && b.isEnabled) return 1;

                    // 2. Prioritize Newer Versions (Descending)
                    // vB - vA: If B > A, result > 0 (B first)
                    return compareVersions(b.meta.version || "0", a.meta.version || "0");
                });

                // Head is groupPkgs[0]. All others are secondary.
                const head = groupPkgs[0];
                const headVer = head.meta.version || "0";
                const headFile = head.fileName;

                for (let i = 1; i < groupPkgs.length; i++) {
                    const currentVer = groupPkgs[i].meta.version || "0";
                    const cmp = compareVersions(currentVer, headVer);

                    // If Equal (0) -> Exact Duplicate
                    if (cmp === 0) {
                        redundantPaths.set(groupPkgs[i].filePath, `Duplicate of active package: ${head.filePath}`);
                        // Debug Log
                        // @ts-ignore
                        if (window.go?.main?.App?.Log) window.go.main.App.Log("DEBUG", `[Analysis] Duplicate: ${groupPkgs[i].fileName} == ${headFile} (v${currentVer})`);
                    } else {
                        // Else Obsolete (current < head)
                        obsoletePaths.set(groupPkgs[i].filePath, `Obsoleted by v${head.meta.version} in: ${head.filePath}`);
                        // Debug Log
                        // @ts-ignore
                        if (window.go?.main?.App?.Log) window.go.main.App.Log("DEBUG", `[Analysis] Obsolete: ${groupPkgs[i].fileName} (v${currentVer}) < ${headFile} (v${headVer})`);
                    }
                }
            }
        });

        // 2b. Build Sets for fast lookup
        const baseIdSet = new Set<string>();
        const enabledBaseIdSet = new Set<string>(); // New: Track enabled packages by BaseID
        pkgs.forEach(p => {
            if (p.meta && p.meta.creator && p.meta.packageName) {
                const base = `${p.meta.creator}.${p.meta.packageName}`.toLowerCase();
                baseIdSet.add(base);
                if (p.isEnabled && !p.isCorrupt) {
                    enabledBaseIdSet.add(base);
                }
            }
        });

        // 3. Exact Duplicate Detection
        const exactDupesMap = new Map<string, number>();
        const enabledDupesMap = new Map<string, number>();

        pkgs.forEach(p => {
            if (p.isCorrupt) return;
            if (!p.meta || !p.meta.creator || !p.meta.packageName) return;
            const key = `${p.meta.creator}.${p.meta.packageName}.${p.meta.version}.${p.size}`;
            exactDupesMap.set(key, (exactDupesMap.get(key) || 0) + 1);
            if (p.isEnabled) {
                enabledDupesMap.set(key, (enabledDupesMap.get(key) || 0) + 1);
            }
        });

        // 4. Graph Analysis (Orphan Detection)
        const { orphans, reverseDeps } = analyzeGraph(pkgs);

        return pkgs.map(p => {
            let isDuplicate = false; // Maps to OBSOLETE (Yellow)
            let isExactDuplicate = false; // Maps to DUPLICATE (Purple)
            let missingDeps: string[] = [];
            let obsoletedBy: string | undefined = undefined;

            if (obsoletePaths.has(p.filePath)) {
                isDuplicate = true;
                obsoletedBy = obsoletePaths.get(p.filePath);
            }
            if (redundantPaths.has(p.filePath)) {
                isExactDuplicate = true; // Same version = Duplicate
                obsoletedBy = redundantPaths.get(p.filePath);
            }

            if (p.meta && p.meta.creator && p.meta.packageName) {
                const exactKey = `${p.meta.creator}.${p.meta.packageName}.${p.meta.version}.${p.size}`;
                if ((exactDupesMap.get(exactKey) || 0) > 1) {
                    isExactDuplicate = true;
                    if (!obsoletedBy) obsoletedBy = "Identical copy exists in library";
                }
            }

            if (p.isEnabled && p.meta && p.meta.dependencies) {
                Object.keys(p.meta.dependencies).forEach(depId => {
                    let isMissing = !pkgIds.has(depId);
                    const cleanDep = depId.toLowerCase();

                    // If exact match fails, try resolving...
                    if (isMissing) {
                        // 1. Is it a .latest pointer?
                        if (cleanDep.endsWith('.latest')) {
                            const baseDep = cleanDep.slice(0, -7);
                            if (enabledBaseIdSet.has(baseDep)) isMissing = false;
                        } else {
                            // 2. Is it a Version Mismatch? (e.g. asking for v1, we have v2)
                            // Fix: Recursive Base Lookup.
                            // Since Package Names AND Versions can contain dots, we can't simply split.
                            // We progressively strip the suffix until we find a known Base ID.
                            // E.g. "A.B.C.1.0" -> Check "A.B.C.1" (No) -> Check "A.B.C" (Yes!)
                            let tempBase = cleanDep;
                            let matchFound = false;

                            // Safety break to prevent infinite loops, though lastIndexOf handles it
                            while (tempBase.includes('.')) {
                                const lastDot = tempBase.lastIndexOf('.');
                                if (lastDot === -1) break;

                                tempBase = tempBase.substring(0, lastDot);
                                if (enabledBaseIdSet.has(tempBase)) {
                                    matchFound = true;
                                    break;
                                }
                            }

                            if (matchFound) {
                                isMissing = false;
                            } else if (window.go?.main?.App?.Log) {
                                // Debug info for persistent mismatches
                                // @ts-ignore
                                window.go.main.App.Log("DEBUG", `[MismatchAnalysis] ${p.fileName} needs ${cleanDep}. Recursive lookup failed.`);
                            }
                        }
                    }

                    if (isMissing) {
                        if (depId !== PACKAGES.CORE.ID && !depId.startsWith("system.")) {
                            missingDeps.push(depId);
                        }
                    }
                });
            }

            return {
                ...p,
                isDuplicate,
                isExactDuplicate,
                missingDeps,
                isOrphan: orphans.has(p.filePath),
                referencedBy: Array.from(reverseDeps.get(`${p.meta.creator}.${p.meta.packageName}.${p.meta.version}`.toLowerCase()) || [])
            };
        });
    }, []);

    const scanPackages = useCallback(async () => {
        if (!activeLibraryPath) {
            setPackages([]);
            setFilteredPkgs([]);
            setAvailableTags([]);
            setScanProgress({ current: 0, total: 0 });
            return;
        }

        // Check if loading to trigger implicit cancellation
        if (loadingRef.current) {
            // Await cancellation but keep loading state true to prevent UI flash
            await cancelScan({ resetLoading: false });
        }

        const currentId = ++scanSessionId.current;
        setLoading(true);
        setPackages([]);
        setFilteredPkgs([]);
        setScanProgress({ current: 0, total: 0 });
        knownPathsRef.current.clear();

        // Initialize Listeners (Common for both Desktop and Web/Polyfill)
        if (window.runtime) {
            // Remove old listeners to be safe
            window.runtime.EventsOff("package:scanned");
            window.runtime.EventsOff("scan:progress");
            window.runtime.EventsOff("scan:complete");
            window.runtime.EventsOff("scan:error");

            let packageBuffer: VarPackage[] = [];
            let lastUpdate = Date.now();
            let updateTimer: any = null;
            const currentScanPath = activeLibraryPath;



            const flushBuffer = () => {
                if (scanSessionId.current !== currentId) return;
                if (packageBuffer.length === 0) return;

                // Optimization: Filter using Ref (O(1)) instead of scanning State (O(N))
                const uniqueBatch: VarPackage[] = [];
                for (const p of packageBuffer) {
                    // Fix: Normalize path to handle Windows case-insensitivity AND slash direction
                    // This prevents "Ghost Duplicates" (C:\File vs c:/file)
                    const normalizedPath = p.filePath.replace(/\\/g, '/').toLowerCase();

                    if (!knownPathsRef.current.has(normalizedPath)) {
                        knownPathsRef.current.add(normalizedPath);
                        uniqueBatch.push(p);
                    } else {
                        // LOGGING: Ghost Duplicate Detection
                        // @ts-ignore
                        if (window.go && window.go.main && window.go.main.App && window.go.main.App.Log) {
                            // @ts-ignore
                            window.go.main.App.Log("WARN", `[Ghost] Dropped duplicate path: ${p.filePath} (Normalized collision with: ${normalizedPath})`);
                        }
                    }
                }
                packageBuffer = [];

                if (uniqueBatch.length === 0) return;

                setPackages(prev => [...prev, ...uniqueBatch]);
            };

            // @ts-ignore
            window.runtime.EventsOn("package:scanned", (data: VarPackage) => {
                if (scanSessionId.current !== currentId) return;
                const pkg = { ...data, isEnabled: data.filePath.endsWith(".var") };

                const normalizedPkgPath = pkg.filePath.replace(/\\/g, '/').toLowerCase();
                const normalizedLibPath = currentScanPath.replace(/\\/g, '/').toLowerCase();
                if (!normalizedPkgPath.includes(normalizedLibPath)) return;

                packageBuffer.push(pkg);
                const now = Date.now();
                if (now - lastUpdate > 500) { // Throttled to 500ms
                    flushBuffer();
                    lastUpdate = now;
                } else if (!updateTimer) {
                    updateTimer = setTimeout(() => {
                        flushBuffer();
                        lastUpdate = Date.now();
                        updateTimer = null;
                    }, 500); // Throttled to 500ms
                }
            });

            // @ts-ignore
            window.runtime.EventsOn("scan:progress", (data: any) => {
                if (scanSessionId.current !== currentId) return;
                setScanProgress({ current: data.current, total: data.total });
            });
            // @ts-ignore
            window.runtime.EventsOn("scan:complete", () => {
                if (scanSessionId.current !== currentId) return;
                if (updateTimer) clearTimeout(updateTimer);
                flushBuffer();
                setPackages(prev => {
                    const analyzed = analyzePackages(prev);

                    // LOGGING: Analysis Results
                    // @ts-ignore
                    if (window.go && window.go.main && window.go.main.App && window.go.main.App.Log) {
                        // @ts-ignore
                        window.go.main.App.Log("INFO", `[Analysis] Scan Complete. Processed ${analyzed.length} packages.`);
                        analyzed.forEach(p => {
                            if (p.obsoletedBy) {
                                const status = p.isExactDuplicate ? "DUPLICATE" : "OBSOLETE";
                                // @ts-ignore
                                window.go.main.App.Log("WARN", `[${status}] ${p.fileName} (${p.filePath}) -> ${p.obsoletedBy}`);
                            }
                        });
                    }

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
                if (scanSessionId.current !== currentId) return;
                if (err && err.includes("canceled")) return;
                console.error("Scan error:", err);
                setLoading(false);
            });
        }

        // Trigger Scan
        if (window.go) {
            try {
                await window.go.main.App.ScanPackages(activeLibraryPath);
            } catch (e) {
                console.error(e);
                setLoading(false);
            }
        } else {
            // Web Mode logic
            if (scanAbortController.current) scanAbortController.current.abort();
            const controller = new AbortController();
            scanAbortController.current = controller;

            try {
                // Fire and forget fetch? No, we await it to catch initial errors.
                // But the events drive the UI.
                const res = await fetchWithAuth(`/api/packages?path=${encodeURIComponent(activeLibraryPath)}`, {
                    signal: controller.signal
                });
                if (!res.ok) throw new Error("Failed to fetch");

                // We typically get the full list at the end of fetch too.
                // If we rely on events, we might duplicate?
                // The 'uniqueBatch' check in flushBuffer prevents duplicates.
                // The 'scan:complete' event handles finalization.
                // We should probably IGNORE the fetch body if events are working, 
                // OR use it as a verification/fallback.
                // For now, let's just let the Events handle it to be consistent with Desktop.
                // We just await the REQUEST initiation.
                // Actually, fetch waits for Handler to finish. 
                // The Handler finishes when Scan finishes.
                // So this await blocks until 100%.
                // But we get events during the wait!

                // Optional: sync at end
                // const pkgs = await res.json();
                // setPackages(prev => ... merge ...);

            } catch (e: any) {
                if (e.name !== 'AbortError') {
                    console.error(e);
                    setLoading(false);
                }
            }
        }
    }, [activeLibraryPath, analyzePackages, cancelScan]); // Added cancelScan dependency



    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (scanAbortController.current) scanAbortController.current.abort();
            if (window.go) {
                window.runtime.EventsOff("package:scanned");
                window.runtime.EventsOff("scan:progress");
                window.runtime.EventsOff("scan:complete");
            }
        };
    }, []);

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
                else if (p.isDuplicate) status = 'warning'; // Note: isDuplicate is "Obsolete" here
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

    return {
        packages,
        setPackages,
        filteredPkgs,
        setFilteredPkgs,
        availableTags,
        setAvailableTags, // Exposed for Tag search logic if needed
        loading,
        setLoading,
        scanProgress,
        setScanProgress,
        scanPackages,
        cancelScan,
        creatorStatus,
        typeStatus,
        analyzePackages,
        isCancelling
    };
};
