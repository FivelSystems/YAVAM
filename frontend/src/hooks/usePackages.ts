import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { VarPackage, PackageAnalysis, ScanStageProgress, ScanStages } from '../types';
import { fetchWithAuth } from '../services/api';

const EMPTY_STAGES: ScanStages = {
    discovery: { current: 0, total: 0, done: false },
    scanning:  { current: 0, total: 0, done: false },
    analyzing: { current: 0, total: 0, done: false },
};

// Signature of the fields that affect how a package renders, filters, and sorts.
// Comparing signatures lets the scan skip no-op updates so memoized cards and the
// sorted view don't churn when a rescan re-confirms data the grid already shows.
const pkgSignature = (p: VarPackage): string => [
    p.isEnabled, p.isCorrupt, p.hasThumbnail, p.thumbnailBase64 ? 1 : 0,
    p.isDuplicate, p.isExactDuplicate, p.isRemovable, p.missingDeps?.length || 0,
    p.obsoletedBy || '', (p.referencedBy || []).join(','),
    p.size, p.fileName, p.type || '', p.creationDate, p.scanPhase,
    p.meta?.creator, p.meta?.packageName, p.meta?.version,
    (p.categories || []).join(','), (p.tags || []).join(','),
].join('|');

// applyScanned merges a Hard Pass result over an existing row. The Hard Pass
// carries file + metadata but NOT analysis (dep/dup/orphan run later), so its
// default flags must never overwrite flags already on the row — otherwise status
// badges flicker off and back on. Returns the existing reference unchanged when
// nothing render-relevant differs, so React.memo skips the card.
const applyScanned = (existing: VarPackage | undefined, incoming: VarPackage): VarPackage => {
    const base = existing ?? incoming;
    const merged: VarPackage = {
        ...base,
        filePath: incoming.filePath,
        fileName: incoming.fileName,
        size: incoming.size,
        meta: incoming.meta,
        type: incoming.type,
        categories: incoming.categories,
        tags: incoming.tags,
        creationDate: incoming.creationDate,
        thumbnailPath: incoming.thumbnailPath,
        hasThumbnail: incoming.hasThumbnail,
        thumbnailBase64: incoming.thumbnailBase64 || base.thumbnailBase64,
        isCorrupt: incoming.isCorrupt,
        isEnabled: incoming.filePath.endsWith('.var'),
        // Never downgrade a row the cache already analyzed back to 'scanned'.
        scanPhase: base.scanPhase === 'analyzed' ? 'analyzed' : 'scanned',
    };
    return existing && pkgSignature(existing) === pkgSignature(merged) ? existing : merged;
};

// applyAnalysis writes Link Pass results onto a row, reusing the existing
// reference when the flags already match (cache-first often already has them).
const applyAnalysis = (p: VarPackage, a: PackageAnalysis): VarPackage => {
    const merged: VarPackage = {
        ...p,
        missingDeps: a.missingDeps ?? [],
        isDuplicate: a.isDuplicate,
        isExactDuplicate: a.isExactDuplicate,
        isRemovable: a.isRemovable,
        obsoletedBy: a.obsoletedBy,
        referencedBy: a.referencedBy,
        scanPhase: 'analyzed',
    };
    return pkgSignature(p) === pkgSignature(merged) ? p : merged;
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

    // Revalidate bookkeeping: paths the scan observed on disk, and whether the
    // grid was painted from cache (so scan:complete prunes now-deleted files).
    const seenThisScanRef = useRef(new Set<string>());
    const cacheSeededRef = useRef(false);

    const normPath = (p: string) => p.replace(/\\/g, '/').toLowerCase();

    // ── Cancel ────────────────────────────────────────────────────────────────
    const cancelScan = useCallback(async (options: { resetLoading?: boolean } = {}) => {
        const { resetLoading = true } = options;
        if (!loadingRef.current) return;
        setIsCancelling(true);
        if (scanAbortController.current) scanAbortController.current.abort();
        if (window.go) {
            await window.go.main.App.CancelScan();
        } else {
            // Await the cancel so the modal stays visible and the new scan does not
            // start until the backend scan goroutine has actually stopped.
            // Flow: abort() closes the connection → Go cancels r.Context() → scan context
            // cancelled → runThreePhase returns → defer scanWg.Done() fires → Wait() unblocks.
            await fetchWithAuth('/api/scan/cancel').catch(() => { /* non-fatal */ });
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
        setScanStages(EMPTY_STAGES);
        knownPathsRef.current.clear();
        seenThisScanRef.current.clear();
        cacheSeededRef.current = false;

        // ── Cache-first paint, then revalidate via the scan below ──────────────
        // Seeding knownPathsRef stops the Light Pass re-adding cached rows as
        // skeletons (avoids a full→skeleton→full flicker); the Hard Pass still
        // updates them in place, and deleted files are pruned on scan:complete.
        if (window.go) {
            let cached: VarPackage[] = [];
            try {
                cached = await window.go.main.App.GetCachedPackages(activeLibraryPath);
            } catch {
                cached = [];
            }
            // A newer scan superseded us during the await (e.g. a library switch, or
            // config validation nudging activeLibraryPath on launch). Abort so we
            // don't clear the grid, steal listeners, or cancel the winning scan.
            if (scanSessionId.current !== currentId) return;

            if (cached && cached.length > 0) {
                cached.forEach(p => knownPathsRef.current.add(normPath(p.filePath)));
                cacheSeededRef.current = true;
                setPackages(cached.map(p => ({ ...p, scanPhase: 'analyzed' as const })));
            } else {
                setPackages([]);
            }
        } else {
            setPackages([]);
        }
        setFilteredPkgs([]);

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

            const libNorm = currentScanPath.replace(/\\/g, '/').toLowerCase();

            const batchFlush = () => {
                if (scanSessionId.current !== currentId) return;

                const toDiscover = discoveredBuffer.splice(0);
                const toScan = scannedBuffer.splice(0);

                if (toDiscover.length === 0 && toScan.length === 0) return;

                setPackages(prev => {
                    const map = new Map<string, VarPackage>(prev.map(p => [p.filePath, p]));
                    let changed = false;

                    for (const p of toDiscover) {
                        const norm = normPath(p.filePath);
                        if (knownPathsRef.current.has(norm)) continue;
                        knownPathsRef.current.add(norm);
                        if (!norm.includes(libNorm)) continue;
                        map.set(p.filePath, { ...p, isEnabled: p.filePath.endsWith('.var'), scanPhase: 'discovered' });
                        changed = true;
                    }

                    for (const p of toScan) {
                        const existing = map.get(p.filePath);
                        const merged = applyScanned(existing, p);
                        if (merged !== existing) {
                            map.set(p.filePath, merged);
                            changed = true;
                        }
                    }

                    // Returning prev unchanged makes React skip the re-render and the
                    // downstream sort — so re-confirming already-correct cache rows
                    // during a rescan never disturbs the grid being browsed.
                    return changed ? Array.from(map.values()) : prev;
                });
            };

            // Phase 1 — Light Pass
            // @ts-ignore
            window.runtime.EventsOn('package:discovered', (data: VarPackage) => {
                if (scanSessionId.current !== currentId) return;
                seenThisScanRef.current.add(normPath(data.filePath));
                discoveredBuffer.push(data);
                const now = Date.now();
                if (now - lastFlush > 200) scheduleFlush(true);
                else scheduleFlush();
            });

            // Phase 2 — Hard Pass
            // @ts-ignore
            window.runtime.EventsOn('package:scanned', (data: VarPackage) => {
                if (scanSessionId.current !== currentId) return;
                seenThisScanRef.current.add(normPath(data.filePath));
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
                setPackages(prev => {
                    let changed = false;
                    const next = prev.map(p => {
                        const a = byPath.get(p.filePath);
                        if (!a) return p;
                        const merged = applyAnalysis(p, a);
                        if (merged !== p) changed = true;
                        return merged;
                    });
                    return changed ? next : prev;
                });
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

                // Reconcile the cache-painted grid with disk: drop any entry the
                // scan never observed (its file was deleted since the last scan),
                // then build available tags from the final package list.
                setPackages(prev => {
                    // Only prune when the scan actually observed files; an empty
                    // seen-set means the scan was interrupted/cancelled, and pruning
                    // would wrongly wipe the cache-painted grid.
                    const reconciled = (cacheSeededRef.current && seenThisScanRef.current.size > 0)
                        ? prev.filter(p => seenThisScanRef.current.has(normPath(p.filePath)))
                        : prev;
                    const tags = new Set<string>();
                    reconciled.forEach(p => p.tags?.forEach(t => tags.add(t)));
                    setTimeout(() => setAvailableTags(Array.from(tags).sort()), 0);
                    return reconciled;
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
            // Web (server) mode — SSE/REST fallback.
            // MUST await: this keeps scanPackages() suspended while the scan is running,
            // matching the desktop behaviour (await ScanPackages()). This ensures that
            // when the library changes and a new scanPackages() call runs cancelScan(),
            // the previous invocation's event listeners have already been torn down and
            // the server scan has completed before the new one starts.
            if (scanAbortController.current) scanAbortController.current.abort();
            const controller = new AbortController();
            scanAbortController.current = controller;
            try {
                await fetchWithAuth(
                    `/api/packages?path=${encodeURIComponent(activeLibraryPath)}&_t=${Date.now()}`,
                    { signal: controller.signal }
                );
            } catch (e: any) {
                // AbortError = we cancelled on purpose; don't clear loading here since
                // cancelScan() already handles state via resetLoading.
                if (e.name !== 'AbortError') {
                    setScanError(e.message || String(e));
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
