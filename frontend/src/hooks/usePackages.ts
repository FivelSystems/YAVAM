import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { VarPackage, PackageAnalysis, ScanStageProgress, ScanStages } from '../types';
import { fetchWithAuth } from '../services/api';

const EMPTY_STAGES: ScanStages = {
    discovery: { current: 0, total: 0, done: false },
    scanning:  { current: 0, total: 0, done: false },
    analyzing: { current: 0, total: 0, done: false },
};

export const usePackages = (activeLibraryPath: string) => {
    const [packages, setPackages] = useState<VarPackage[]>([]);
    const [scanError, setScanError] = useState<string | null>(null);
    const [filteredPkgs, setFilteredPkgs] = useState<VarPackage[]>([]);
    const [availableTags, setAvailableTags] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const loadingRef = useRef(false);
    useEffect(() => { loadingRef.current = loading; }, [loading]);

    const [scanStages, setScanStages] = useState<ScanStages>(EMPTY_STAGES);
    const scanSessionId = useRef(0);
    const scanAbortController = useRef<AbortController | null>(null);
    const [isCancelling, setIsCancelling] = useState(false);

    // Sync tracker: normalised paths we've already added to avoid ghost duplicates.
    const knownPathsRef = useRef(new Set<string>());

    // ── Cancel ────────────────────────────────────────────────────────────────
    const cancelScan = useCallback(async (options: { resetLoading?: boolean } = {}) => {
        const { resetLoading = true } = options;
        if (!loadingRef.current) return;
        setIsCancelling(true);
        if (scanAbortController.current) scanAbortController.current.abort();
        if (window.go) {
            await window.go.main.App.CancelScan();
        }
        if (resetLoading) setLoading(false);
        setIsCancelling(false);
    }, []);

    // ── Priority bump ─────────────────────────────────────────────────────────
    /**
     * Tell the backend's Hard Pass to scan these paths next.
     * Called by FilterContext when the page changes, and by PackageCard on click.
     */
    const prioritizePackages = useCallback((paths: string[]) => {
        if (!window.go || paths.length === 0) return;
        window.go.main.App.SetCurrentPage(paths).catch(() => { /* non-fatal */ });
    }, []);

    const prioritizePackage = useCallback((path: string) => {
        if (!window.go) return;
        window.go.main.App.PrioritizePackage(path).catch(() => { /* non-fatal */ });
    }, []);

    // ── Scan ──────────────────────────────────────────────────────────────────
    const scanPackages = useCallback(async () => {
        if (!activeLibraryPath) {
            setPackages([]);
            setFilteredPkgs([]);
            setAvailableTags([]);
            setScanStages(EMPTY_STAGES);
            return;
        }

        if (loadingRef.current) {
            await cancelScan({ resetLoading: false });
        }

        const currentId = ++scanSessionId.current;
        setLoading(true);
        setScanError(null);
        setPackages([]);
        setFilteredPkgs([]);
        setScanStages(EMPTY_STAGES);
        knownPathsRef.current.clear();

        if (window.runtime) {
            // Remove stale listeners
            window.runtime.EventsOff('package:discovered');
            window.runtime.EventsOff('package:scanned');
            window.runtime.EventsOff('scan:analysis:complete');
            window.runtime.EventsOff('scan:stage');
            window.runtime.EventsOff('scan:complete');
            window.runtime.EventsOff('scan:error');

            const currentScanPath = activeLibraryPath;

            // ── Buffered batch flush for discovered/scanned ───────────────────
            let discoveredBuffer: VarPackage[] = [];
            let scannedBuffer: VarPackage[] = [];
            let lastFlush = Date.now();
            let flushTimer: ReturnType<typeof setTimeout> | null = null;

            const scheduleFlush = (immediate = false) => {
                if (flushTimer) clearTimeout(flushTimer);
                const delay = immediate ? 0 : 200;
                flushTimer = setTimeout(() => {
                    flushTimer = null;
                    batchFlush();
                    lastFlush = Date.now();
                }, delay);
            };

            const batchFlush = () => {
                if (scanSessionId.current !== currentId) return;

                const toDiscover = discoveredBuffer.splice(0);
                const toScan = scannedBuffer.splice(0);

                if (toDiscover.length === 0 && toScan.length === 0) return;

                setPackages(prev => {
                    // Build a mutable map for fast updates.
                    const map = new Map<string, VarPackage>(prev.map(p => [p.filePath, p]));

                    for (const p of toDiscover) {
                        const norm = p.filePath.replace(/\\/g, '/').toLowerCase();
                        if (!knownPathsRef.current.has(norm)) {
                            knownPathsRef.current.add(norm);
                            const libNorm = currentScanPath.replace(/\\/g, '/').toLowerCase();
                            if (!norm.includes(libNorm)) continue;
                            map.set(p.filePath, { ...p, isEnabled: p.filePath.endsWith('.var'), scanPhase: 'discovered' });
                        }
                    }

                    for (const p of toScan) {
                        const existing = map.get(p.filePath);
                        map.set(p.filePath, {
                            ...(existing ?? p),
                            ...p,
                            isEnabled: p.filePath.endsWith('.var'),
                            scanPhase: 'scanned',
                        });
                    }

                    return Array.from(map.values());
                });
            };

            // Phase 1 — Light Pass
            // @ts-ignore
            window.runtime.EventsOn('package:discovered', (data: VarPackage) => {
                if (scanSessionId.current !== currentId) return;
                discoveredBuffer.push(data);
                const now = Date.now();
                if (now - lastFlush > 200) scheduleFlush(true);
                else scheduleFlush();
            });

            // Phase 2 — Hard Pass
            // @ts-ignore
            window.runtime.EventsOn('package:scanned', (data: VarPackage) => {
                if (scanSessionId.current !== currentId) return;
                scannedBuffer.push(data);
                const now = Date.now();
                if (now - lastFlush > 200) scheduleFlush(true);
                else scheduleFlush();
            });

            // Phase 3 — Link Pass: ONE batch event with ALL analysis results.
            // The backend emits a single 'scan:analysis:complete' event after LinkPass().
            // We do ONE setPackages call using a Map for O(N) lookup — no O(N²).
            // @ts-ignore
            window.runtime.EventsOn('scan:analysis:complete', (analyses: PackageAnalysis[]) => {
                if (scanSessionId.current !== currentId) return;
                const byPath = new Map(analyses.map(a => [a.filePath, a]));
                setPackages(prev => prev.map(p => {
                    const a = byPath.get(p.filePath);
                    if (!a) return p;
                    return {
                        ...p,
                        missingDeps: a.missingDeps ?? [],
                        isDuplicate: a.isDuplicate,
                        isExactDuplicate: a.isExactDuplicate,
                        isOrphan: a.isOrphan,
                        obsoletedBy: a.obsoletedBy,
                        referencedBy: a.referencedBy,
                        scanPhase: 'analyzed' as const,
                    };
                }));
            });

            // Stage progress → update the stacked progress bar
            // @ts-ignore
            window.runtime.EventsOn('scan:stage', (sp: ScanStageProgress) => {
                if (scanSessionId.current !== currentId) return;
                setScanStages(prev => ({
                    ...prev,
                    [sp.stage]: { current: sp.current, total: sp.total, done: sp.done },
                }));
            });

            // Scan complete
            // @ts-ignore
            window.runtime.EventsOn('scan:complete', () => {
                if (scanSessionId.current !== currentId) return;
                if (flushTimer) clearTimeout(flushTimer);
                batchFlush();

                // Build available tags from final package list
                setPackages(prev => {
                    const tags = new Set<string>();
                    prev.forEach(p => p.tags?.forEach(t => tags.add(t)));
                    setTimeout(() => setAvailableTags(Array.from(tags).sort()), 0);
                    return prev;
                });
                setLoading(false);
            });

            // @ts-ignore
            window.runtime.EventsOn('scan:error', (err: string) => {
                if (scanSessionId.current !== currentId) return;
                if (err?.includes('canceled')) return;
                setScanError(err);
                setLoading(false);
            });
        }

        // Trigger scan on backend
        if (window.go) {
            try {
                await window.go.main.App.ScanPackages(activeLibraryPath);
            } catch (e: any) {
                setScanError(e.message || String(e));
                setLoading(false);
            }
        } else {
            // Web (server) mode — SSE/REST fallback
            if (scanAbortController.current) scanAbortController.current.abort();
            const controller = new AbortController();
            scanAbortController.current = controller;
            try {
                await fetchWithAuth(
                    `/api/packages?path=${encodeURIComponent(activeLibraryPath)}&_t=${Date.now()}`,
                    { signal: controller.signal }
                );
            } catch (e: any) {
                if (e.name !== 'AbortError') {
                    setLoading(false);
                }
            }
        }
    }, [activeLibraryPath, cancelScan]);

    // Cleanup listeners on unmount
    useEffect(() => {
        return () => {
            if (scanAbortController.current) scanAbortController.current.abort();
            if (window.runtime) {
                window.runtime.EventsOff('package:discovered');
                window.runtime.EventsOff('package:scanned');
                window.runtime.EventsOff('scan:analysis:complete');
                window.runtime.EventsOff('scan:stage');
                window.runtime.EventsOff('scan:complete');
                window.runtime.EventsOff('scan:error');
            }
        };
    }, []);

    // Creator / type status badges for sidebar (unchanged logic, minus the frontend analyzePackages)
    const { creatorStatus, typeStatus } = useMemo(() => {
        const cStatus: Record<string, 'normal' | 'warning' | 'error'> = {};
        const tStatus: Record<string, 'normal' | 'warning' | 'error'> = {};
        const update = (map: Record<string, 'normal' | 'warning' | 'error'>, key: string, val: 'normal' | 'warning' | 'error') => {
            if (val === 'error') map[key] = 'error';
            else if (val === 'warning' && map[key] !== 'error') map[key] = 'warning';
            else if (!map[key]) map[key] = 'normal';
        };

        packages.forEach(p => {
            let status: 'normal' | 'warning' | 'error' = 'normal';
            if (p.isEnabled) {
                if (p.missingDeps?.length) status = 'error';
                else if (p.isDuplicate) status = 'warning';
            }
            update(cStatus, p.meta?.creator || 'Unknown', status);
            (p.categories?.length ? p.categories : ['Other']).forEach(c => update(tStatus, c, status));
        });

        return { creatorStatus: cStatus, typeStatus: tStatus };
    }, [packages]);

    return {
        packages,
        setPackages,
        scanError,
        filteredPkgs,
        setFilteredPkgs,
        availableTags,
        setAvailableTags,
        loading,
        setLoading,
        scanStages,
        setScanStages,
        scanPackages,
        cancelScan,
        prioritizePackages,
        prioritizePackage,
        creatorStatus,
        typeStatus,
        isCancelling,
        // Legacy alias so existing consumers keep working while we migrate
        scanProgress: {
            current: scanStages.scanning.current,
            total: scanStages.scanning.total,
        },
    };
};
