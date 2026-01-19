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

        // 2. Identify Obsolete Packages
        const obsoletePaths = new Set<string>();
        groups.forEach((groupPkgs) => {
            if (groupPkgs.length > 1) {
                groupPkgs.sort((a, b) => {
                    const vA = a.meta.version || "";
                    const vB = b.meta.version || "";
                    // Use numeric natural sort (10 > 2)
                    const res = vB.localeCompare(vA, undefined, { numeric: true, sensitivity: 'base' });
                    if (res !== 0) return res;

                    // Tie-break: Enabled first to ensure active package isn't marked obsolete
                    if (a.isEnabled && !b.isEnabled) return -1;
                    if (!a.isEnabled && b.isEnabled) return 1;
                    return 0;
                });
                for (let i = 1; i < groupPkgs.length; i++) {
                    obsoletePaths.add(groupPkgs[i].filePath);
                }
            }
        });

        // 2b. Build BaseID Set for "latest" resolution (Creator.Package)
        const baseIdSet = new Set<string>();
        pkgs.forEach(p => {
            if (p.meta && p.meta.creator && p.meta.packageName) {
                baseIdSet.add(`${p.meta.creator}.${p.meta.packageName}`.toLowerCase());
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
        // Only run this if we have a significant number of packages to avoid overhead on small updates?
        // Actually, scan:complete calls this with the full list.


        // 4. Graph Analysis (Orphan Detection)
        const { orphans, reverseDeps } = analyzeGraph(pkgs);

        return pkgs.map(p => {
            let isDuplicate = false;
            let isExactDuplicate = false;
            let missingDeps: string[] = [];

            if (obsoletePaths.has(p.filePath)) isDuplicate = true;

            if (p.meta && p.meta.creator && p.meta.packageName) {
                const exactKey = `${p.meta.creator}.${p.meta.packageName}.${p.meta.version}.${p.size}`;
                // Fix: Check global map. If > 1 exist ANYWHERE, it's an exact duplicate.
                if ((exactDupesMap.get(exactKey) || 0) > 1) {
                    isExactDuplicate = true;
                }
            }

            if (p.isEnabled && p.meta && p.meta.dependencies) {
                Object.keys(p.meta.dependencies).forEach(depId => {
                    let isMissing = !pkgIds.has(depId);

                    // If simple check fails, try resolving "latest"
                    if (isMissing && depId.endsWith('.latest')) {
                        const baseDep = depId.slice(0, -7).toLowerCase(); // remove .latest (Creator.Package)
                        // Scan pkgIds keys for any version of this baseDep?
                        // This is O(N) inside the loop, unnecessarily slow.
                        // Optimization: We can check if ANY key in pkgIds starts with baseDep.

                        // Better Optimization: "latest" resolution usually implies we just need ONE valid version to exist.
                        // We can rebuild a quick `Creator.Package` Set outside the loop.
                        // See Step 1 below (I will add baseIdSet).
                        if (baseIdSet.has(baseDep)) {
                            isMissing = false;
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
                    if (!knownPathsRef.current.has(p.filePath)) {
                        knownPathsRef.current.add(p.filePath);
                        uniqueBatch.push(p);
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
