import { useState, useCallback } from 'react';
import { VarPackage } from '../types';
import { ManualPlan } from '../features/settings/OptimizationModal';
import { fetchWithAuth } from '../services/api';

export const usePackageActions = (
    packages: VarPackage[],
    setPackages: React.Dispatch<React.SetStateAction<VarPackage[]>>,
    activeLibraryPath: string,
    scanPackages: () => void,
    selectedIds: Set<string>,
    setSelectedIds: (ids: Set<string>) => void,
    setSelectedPackage: (p: VarPackage | null) => void,
    addToast: (msg: string, type: 'info' | 'success' | 'warning' | 'error' | 'default') => void,
    analyzePackages?: (pkgs: VarPackage[]) => VarPackage[],
    setLoading?: (loading: boolean) => void,
    setScanProgress?: (progress: { current: number; total: number }) => void,
    addProgressToast?: (message: string, current: number, total: number) => string,
    updateToast?: (id: string, patch: any) => void,
    completeProgressToast?: (id: string, message: string, type: 'success' | 'warning' | 'error', dismissAfterMs?: number) => void,
    removeToast?: (id: string) => void
) => {
    // -- Local State for Modals --
    const [installModal, setInstallModal] = useState<{ open: boolean; pkgs: VarPackage[] }>({ open: false, pkgs: [] });

    // Deletion
    const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; pkg: VarPackage | null; pkgs?: VarPackage[]; count?: number }>({ open: false, pkg: null });

    // Collision
    const [collisionData, setCollisionData] = useState<{ open: boolean; pkg: VarPackage | null }>({ open: false, pkg: null });

    // Optimization
    const [optimizationData, setOptimizationData] = useState<{
        open: boolean;
        mergePlan: { keep: VarPackage; delete: VarPackage[] }[];
        resolveGroups: { id: string; packages: VarPackage[] }[];
        forceGlobalMode?: boolean;
        targetPackage?: VarPackage;
    }>({ open: false, mergePlan: [], resolveGroups: [], forceGlobalMode: false, targetPackage: undefined });

    // Optimization Progress
    const [optimizationProgress, setOptimizationProgress] = useState<{
        open: boolean;
        current: number;
        total: number;
        currentFile: string;
        spaceSaved: number;
        completed: boolean;
        errors: string[];
    }>({ open: false, current: 0, total: 0, currentFile: '', spaceSaved: 0, completed: false, errors: [] });


    // -- Core Actions --

    const recalculateDuplicates = useCallback((currentPkgs: VarPackage[]): VarPackage[] => {
        return analyzePackages ? analyzePackages(currentPkgs) : currentPkgs;
    }, [analyzePackages]);

    const togglePackage = useCallback(async (pkg: VarPackage, merge = false, silent = false) => {
        try {
            let newPath = "";
            // @ts-ignore
            if (window.go) {
                // @ts-ignore
                newPath = await window.go.main.App.TogglePackage(pkg.filePath, !pkg.isEnabled, activeLibraryPath, merge);
            } else {
                // Web Mode
                const res = await fetchWithAuth('/api/toggle', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filePath: pkg.filePath, enable: !pkg.isEnabled, merge: merge, libraryPath: activeLibraryPath })
                }).then(r => r.json());

                if (!res.success) throw new Error(res.message || res.error || "Unknown error");
                newPath = res.newPath;
            }

            if (!silent) addToast(pkg.isEnabled ? "Package disabled" : "Package enabled", 'success');

            // Optimistic update
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
    }, [activeLibraryPath, addToast, recalculateDuplicates, setPackages]);


    const handleBulkToggle = useCallback(async (pkg: VarPackage) => {
        // If multiple items selected and the clicked package is part of the selection, operate on all
        if (selectedIds.has(pkg.filePath) && selectedIds.size > 1) {
            const targets = Array.from(selectedIds)
                .map(id => packages.find(pk => pk.filePath === id))
                .filter(Boolean) as VarPackage[];

            // Fire all requests in parallel — flipping the switch per package (core design)
            const results = await Promise.allSettled(
                targets.map(async (p) => {
                    const targetEnabled = !p.isEnabled;

                    // Skip packages already in the target state
                    if (p.isEnabled === targetEnabled) return { pkg: p, newPath: p.filePath, targetEnabled };

                    let newPath = p.filePath;
                    // @ts-ignore
                    if (window.go) {
                        // @ts-ignore
                        newPath = await window.go.main.App.TogglePackage(p.filePath, targetEnabled, activeLibraryPath, false);
                    } else {
                        const res = await fetchWithAuth('/api/toggle', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ filePath: p.filePath, enable: targetEnabled, merge: false, libraryPath: activeLibraryPath })
                        }).then(r => r.json());
                        if (!res.success) throw new Error(res.message || res.error || 'Unknown error');
                        newPath = res.newPath;
                    }
                    return { pkg: p, newPath, targetEnabled };
                })
            );

            // Count outcomes
            const succeeded: { pkg: VarPackage; newPath: string; targetEnabled: boolean }[] = [];
            const failed: string[] = [];
            for (const result of results) {
                if (result.status === 'fulfilled') {
                    succeeded.push(result.value);
                } else {
                    const err = (result.reason as Error).toString();
                    // Collision on one of them — inform but continue
                    if (err.includes('already exists') || err.includes('already active')) {
                        failed.push('collision');
                    } else {
                        failed.push(err);
                    }
                }
            }

            // Single batched state update for all successful toggles
            if (succeeded.length > 0) {
                const updateMap = new Map(succeeded.map(s => [s.pkg.filePath, { newPath: s.newPath, targetEnabled: s.targetEnabled }]));
                setPackages(prev => {
                    const updated = prev.map(p => {
                        if (updateMap.has(p.filePath)) {
                            const data = updateMap.get(p.filePath)!;
                            return { ...p, isEnabled: data.targetEnabled, filePath: data.newPath };
                        }
                        return p;
                    });
                    return recalculateDuplicates(updated);
                });
                addToast(`Toggled ${succeeded.length} package(s)${failed.length > 0 ? ` (${failed.length} failed)` : ''}`, succeeded.length > 0 ? 'success' : 'warning');
            } else {
                addToast('All toggles failed', 'error');
            }
        } else {
            togglePackage(pkg);
        }
    }, [selectedIds, packages, activeLibraryPath, togglePackage, addToast, setPackages, recalculateDuplicates]);


    const handleConfirmCollision = useCallback(() => {
        if (collisionData.pkg) {
            togglePackage(collisionData.pkg, true); // Retry with merge
            setCollisionData({ open: false, pkg: null });
        }
    }, [collisionData, togglePackage]);


    // -- Deletion Logic --

    const handleDeleteClick = useCallback((pkg: VarPackage, pkgsOverride?: VarPackage[]) => {
        // If an explicit list is provided (e.g. from sidebar), use it directly.
        if (pkgsOverride && pkgsOverride.length > 0) {
            setDeleteConfirm({ open: true, pkg, pkgs: pkgsOverride, count: pkgsOverride.length });
            return;
        }
        // Multi-selection check
        if (selectedIds.has(pkg.filePath) && selectedIds.size > 1) {
            const targets = packages.filter(p => selectedIds.has(p.filePath));
            setDeleteConfirm({ open: true, pkg, pkgs: targets, count: targets.length });
        } else {
            setDeleteConfirm({ open: true, pkg });
        }
    }, [selectedIds, packages]);

    const handleExecuteDelete = useCallback(async (files: string[]) => {
        if (files.length === 0) return;

        // 1. Close the modal immediately — UI stays responsive.
        setDeleteConfirm({ open: false, pkg: null, pkgs: [] });

        // 2. Optimistic removal — remove from local state right away.
        const fileSet = new Set(files);
        setPackages(prev => prev.filter(p => !fileSet.has(p.filePath)));
        setSelectedIds(new Set());
        setSelectedPackage(null);

        // @ts-ignore
        if (window.go) {
            // --- Desktop (Wails) — non-blocking async ---

            // 3. Show a live progress toast.
            const label = files.length > 1
                ? `Deleting ${files.length} packages…`
                : 'Deleting package…';
            const toastId = addProgressToast
                ? addProgressToast(label, 0, files.length)
                : null;

            // Guard: ensures the completion handler only fires once even if
            // EventsOn accumulates stale listeners across rapid calls.
            let fired = false;

            const onComplete = (data: any) => {
                if (fired) return;
                fired = true;

                // Unsubscribe both channels by name — clears ALL listeners,
                // preventing stale handlers from firing on the next deletion.
                if (window.runtime) {
                    window.runtime.EventsOff('delete:progress');
                    window.runtime.EventsOff('delete:complete');
                }

                const succeeded: number = data.succeeded ?? 0;
                const failed: string[] = data.failed ?? [];
                const allOk = failed.length === 0;

                if (toastId && completeProgressToast) {
                    // Transition the progress toast to its final state in-place.
                    const finalMsg = succeeded > 1
                        ? `Deleted ${succeeded} packages${!allOk ? ` (⚠️ ${failed.length} failed)` : ''}`
                        : succeeded === 1
                            ? 'Package deleted'
                            : `All ${files.length} deletions failed`;
                    const finalType = succeeded === 0 ? 'error' : allOk ? 'success' : 'warning';
                    completeProgressToast(toastId, finalMsg, finalType, 3500);
                } else {
                    // Fallback if toast APIs not available.
                    if (succeeded > 0) addToast(
                        succeeded > 1 ? `Deleted ${succeeded} packages` : 'Package deleted',
                        allOk ? 'success' : 'warning'
                    );
                }

                if (failed.length > 0) {
                    console.error('Failed deletes:', failed);
                }

                // Final reconciliation scan.
                scanPackages();
            };

            // 4. Unsubscribe any leftover listeners from a previous deletion
            //    BEFORE registering new ones. This is the key fix for duplication.
            if (window.runtime) {
                window.runtime.EventsOff('delete:progress');
                window.runtime.EventsOff('delete:complete');

                window.runtime.EventsOn('delete:progress', (data: any) => {
                    if (toastId && updateToast) {
                        updateToast(toastId, {
                            progress: { current: data.current, total: data.total }
                        });
                    }
                });

                window.runtime.EventsOn('delete:complete', onComplete);
            }

            // 5. Fire-and-forget — returns instantly, deletion runs in goroutine.
            // @ts-ignore
            window.go.main.App.BulkDeleteFilesToRecycleBinAsync(files);

        } else {
            // --- Web mode — sequential with per-item progress toast ---
            const label = files.length > 1
                ? `Deleting ${files.length} packages…`
                : 'Deleting package…';
            const toastId = addProgressToast
                ? addProgressToast(label, 0, files.length)
                : null;

            let successCount = 0;
            const failedFiles: string[] = [];

            for (let i = 0; i < files.length; i++) {
                const filePath = files[i];
                try {
                    const res = await fetchWithAuth('/api/delete', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ filePath, libraryPath: activeLibraryPath })
                    }).then(r => r.json());

                    if (res.success) successCount++;
                    else failedFiles.push(filePath);
                } catch {
                    failedFiles.push(filePath);
                }

                // Update progress toast after each file.
                if (toastId && updateToast) {
                    updateToast(toastId, { progress: { current: i + 1, total: files.length } });
                }
            }

            // Transition the progress toast to its final state in-place.
            if (toastId && completeProgressToast) {
                const allOk = failedFiles.length === 0;
                const finalMsg = successCount > 1
                    ? `Deleted ${successCount} packages${!allOk ? ` (⚠️ ${failedFiles.length} failed)` : ''}`
                    : successCount === 1
                        ? 'Package deleted'
                        : `All ${files.length} deletions failed`;
                const finalType = successCount === 0 ? 'error' : allOk ? 'success' : 'warning';
                completeProgressToast(toastId, finalMsg, finalType, 3500);
            } else {
                if (toastId && removeToast) removeToast(toastId);
                if (successCount > 0) addToast(
                    successCount > 1 ? `Deleted ${successCount} packages` : 'Package deleted',
                    failedFiles.length > 0 ? 'warning' : 'success'
                );
                if (failedFiles.length > 0) {
                    addToast(`${failedFiles.length} file(s) could not be deleted`, 'error');
                }
            }

            scanPackages();
        }
    }, [activeLibraryPath, addToast, addProgressToast, updateToast, completeProgressToast, removeToast, scanPackages, setSelectedIds, setSelectedPackage, setPackages]);


    // -- Bulk Operations (Sidebar) --

    const handleSidebarAction = useCallback(async (action: 'enable-all' | 'disable-all' | 'resolve-all' | 'install-all', groupType: 'creator' | 'type' | 'status', key: string) => {
        const targets = packages.filter(p => {
            if (groupType === 'creator') return (p.meta.creator || "Unknown") === key;
            if (groupType === 'type') {
                if (p.categories && p.categories.length > 0) return p.categories.includes(key);
                return (p.type || "Unknown") === key;
            }
            if (groupType === 'status') {
                if (key === 'all') return true;
                if (key === 'enabled') return p.isEnabled && !p.isCorrupt;
                if (key === 'disabled') return !p.isEnabled && !p.isCorrupt;
                if (key === 'missing-deps') return p.missingDeps && p.missingDeps.length > 0 && !p.isCorrupt;
                if (key === 'removable') return p.isRemovable && !p.isCorrupt;
                if (key === 'version-conflicts') return p.isDuplicate && !p.isCorrupt; // Using 'isDuplicate' flag for 'Obsolete/Conflict' bucket logic
                if (key === 'exact-duplicates') return p.isExactDuplicate && !p.isCorrupt;
                if (key === 'corrupt') return p.isCorrupt;
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

            // Regroup everything by "Identity" (Creator + PackageName)
            const processedIdentities = new Set<string>();

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

                // Pick keeper
                const uniqueVersions: VarPackage[] = [];

                exactGroups.forEach((dupes) => {
                    if (dupes.length > 1) {
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
                        uniqueVersions.push(keep);
                    } else {
                        uniqueVersions.push(dupes[0]);
                    }
                });

                // Step 2: Resolve Version Conflicts
                if (uniqueVersions.length > 1) {
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
            if (setLoading) setLoading(true);
            let processed = 0;
            const toToggle = targets.filter(p => action === 'enable-all' ? !p.isEnabled : p.isEnabled);

            if (setScanProgress) setScanProgress({ current: 0, total: toToggle.length });

            for (const p of toToggle) {
                await togglePackage(p, false, true).catch(console.error);
                processed++;
                if (setScanProgress) setScanProgress({ current: processed, total: toToggle.length });
            }
            if (setLoading) setLoading(false);
            addToast(`${action === 'enable-all' ? 'Enabled' : 'Disabled'} ${processed} packages`, 'success');
            return;
        }

        scanPackages();
    }, [packages, activeLibraryPath, addToast, togglePackage, setLoading, setScanProgress, scanPackages]);


    // -- Utility Actions --

    const handleGetDependencyStatus = useCallback((depId: string): 'valid' | 'mismatch' | 'missing' | 'scanning' | 'system' | 'corrupt' | 'disabled' => {
        const cleanDep = depId.toLowerCase();
        if (cleanDep.startsWith("vam.core")) return 'system';

        // 1. Exact Match
        const exact = packages.find(p => {
            const id = `${p.meta.creator}.${p.meta.packageName}.${p.meta.version}`;
            return id.toLowerCase() === cleanDep;
        });

        if (exact) {
            if (exact.isCorrupt) return 'corrupt';
            if (!exact.isEnabled) return 'disabled';
            return 'valid';
        }

        // 2. Latest Resolution
        if (cleanDep.endsWith('.latest')) {
            const baseId = cleanDep.slice(0, -7); // Remove .latest
            // Check if any package matches this base ID
            const candidates = packages.filter(p =>
                `${p.meta.creator}.${p.meta.packageName}`.toLowerCase() === baseId
            );

            if (candidates.length > 0) {
                // Optimization: If we have ANY candidate, and we asked for latest, 
                // we assume the "system" (Yavam) can resolve it to the latest one available.
                // So it's effectively valid, unless ALL candidates are corrupt?
                const validCandidate = candidates.find(p => !p.isCorrupt);
                if (validCandidate) return 'valid';
                return 'corrupt';
            }
            return 'missing';
        }

        // 3. Version Mismatch (e.g. asking for v1, we have v2)
        // Assume format is Creator.Package.Version. 
        // We strip the last segment (Version) and search for the base.
        const lastDot = cleanDep.lastIndexOf('.');
        if (lastDot > 0) {
            const baseId = cleanDep.substring(0, lastDot);
            // Verify if this baseId exists in our library
            // Verify if this baseId exists in our library
            const candidates = packages.filter(p =>
                `${p.meta.creator}.${p.meta.packageName}`.toLowerCase() === baseId
            );

            if (candidates.length > 0) {
                // If we have ANY enabled & healthy version, treat the dependency as VALID (Green).
                // This resolves "False Obsolete" / "Yellow Warning" fatigue when you simply have a newer/different version.
                const hasWorkingCandidate = candidates.some(p => p.isEnabled && !p.isCorrupt);
                if (hasWorkingCandidate) return 'valid';

                // If we have it but it's disabled
                const hasDisabled = candidates.some(p => !p.isEnabled);
                if (hasDisabled) return 'disabled';

                return 'mismatch';
            }
        }

        return 'missing';
    }, [packages]);


    const handleInstantMerge = useCallback(async (pkg: VarPackage, inPlace: boolean) => {
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
        if (setLoading) setLoading(true);
        try {
            for (const d of duplicates) {
                // @ts-ignore
                if (window.go) {
                    // @ts-ignore
                    await window.go.main.App.DeleteFileToRecycleBin(d.filePath);
                } else {
                    const res = await fetchWithAuth('/api/delete', {
                        method: 'POST',
                        body: JSON.stringify({ filePath: d.filePath, libraryPath: activeLibraryPath })
                    }).then(r => r.json());
                    if (!res.success) throw new Error("Web delete failed");
                }
            }

            if (!inPlace) {
                const normalize = (p: string) => p.replace(/[\\/]/g, '/').replace(/\/$/, '').toLowerCase();
                const libPathClean = normalize(activeLibraryPath);
                const pkgPath = normalize(pkg.filePath);
                const pkgParent = pkgPath.substring(0, Math.max(pkgPath.lastIndexOf('/'), pkgPath.lastIndexOf('\\')));

                if (pkgParent !== libPathClean) {
                    // @ts-ignore
                    if (window.go) {
                        // @ts-ignore
                        await window.go.main.App.CopyPackagesToLibrary([pkg.filePath], activeLibraryPath, false);
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
        } finally {
            if (setLoading) setLoading(false);
        }
    }, [packages, activeLibraryPath, setLoading, addToast, scanPackages]);


    const handleSingleResolve = useCallback((pkg: VarPackage) => {
        const normalize = (p: string) => p.replace(/[\\/]/g, '/').replace(/\/$/, '').toLowerCase();
        const libPathClean = normalize(activeLibraryPath);

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
        const exactGroups = new Map<string, VarPackage[]>();

        conflictGroup.forEach(p => {
            const key = `${p.meta.version}.${p.size}`;
            if (!exactGroups.has(key)) exactGroups.set(key, []);
            exactGroups.get(key)?.push(p);
        });

        const uniqueVersions: VarPackage[] = [];

        exactGroups.forEach((dupes) => {
            if (dupes.length > 1) {
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
                mergePlan.push({ keep, delete: dupes.slice(1) });
                uniqueVersions.push(keep);
            } else {
                uniqueVersions.push(dupes[0]);
            }
        });

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
    }, [packages, activeLibraryPath, addToast]);


    const handleConfirmOptimization = useCallback(async (enableMerge: boolean, resolutionStrategy: 'latest' | 'manual' | 'none' | 'delete-older', manualPlan: ManualPlan) => {
        setOptimizationData(prev => ({ ...prev, open: false }));

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
                                // @ts-ignore
                                await window.go.main.App.DeleteFileToRecycleBin(keep.filePath);
                            } else {
                                const res = await fetchWithAuth('/api/install', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        filePaths: [keep.filePath],
                                        destLib: activeLibraryPath,
                                        overwrite: false
                                    })
                                });
                                if (!res.ok) {
                                    const errData = await res.json();
                                    throw new Error(errData.error || "Web copy failed");
                                }
                                await fetchWithAuth('/api/delete', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ filePath: keep.filePath, libraryPath: activeLibraryPath })
                                });
                            }
                        } catch (e: any) {
                            errors.push(`Failed to move ${keep.fileName}: ${e.message}`);
                        }
                    }

                    for (const d of toDelete) {
                        setOptimizationProgress(prev => ({ ...prev, currentFile: `Deleting ${d.fileName}...` }));
                        try {
                            // @ts-ignore
                            if (window.go) {
                                // @ts-ignore
                                await window.go.main.App.DeleteFileToRecycleBin(d.filePath);
                            } else {
                                await fetchWithAuth('/api/delete', {
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
                    if (allPkgs.length < 2) continue;

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
                        for (const p of allPkgs) {
                            try {
                                if (p.filePath === targetVersionPath) {
                                    if (!p.isEnabled) await togglePackage(p, true, false);
                                } else {
                                    if (resolutionStrategy === 'delete-older') {
                                        // @ts-ignore
                                        if (window.go) {
                                            // @ts-ignore
                                            await window.go.main.App.DeleteFileToRecycleBin(p.filePath);
                                        } else {
                                            await fetchWithAuth('/api/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filePath: p.filePath, libraryPath: activeLibraryPath }) });
                                        }
                                        savedBytes += p.size;
                                    } else {
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
            if (setLoading) setLoading(false);
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
    }, [optimizationData, activeLibraryPath, togglePackage, scanPackages, addToast, setLoading]);


    // -- Clipboard / Explorer Utils --
    const handleOpenFolder = useCallback(async (pkg: VarPackage) => {
        // @ts-ignore
        if (!window.go) return addToast("Not available in web mode", 'error');
        try {
            // @ts-ignore
            await window.go.main.App.OpenFolderInExplorer(pkg.filePath);
        } catch (e) { console.error(e); }
    }, [addToast]);

    const handleCopyPath = useCallback(async (pkg: VarPackage) => {
        try {
            await navigator.clipboard.writeText(pkg.filePath);
            addToast("Path copied to clipboard", 'success');
        } catch (e) { console.error(e); }
    }, [addToast]);

    const handleCopyFiles = useCallback(async (pkgs: VarPackage[]) => {
        // @ts-ignore
        if (!window.go) return addToast("Not available in web mode", 'error');
        if (!pkgs || pkgs.length === 0) return;
        try {
            const paths = pkgs.map(p => p.filePath);
            // @ts-ignore
            await window.go.main.App.CopyFilesToClipboard(paths);
            addToast(`${pkgs.length} file(s) copied to clipboard`, 'success');
        } catch (e) { console.error(e); }
    }, [addToast]);

    const handleCutFile = useCallback(async (pkg: VarPackage) => {
        // @ts-ignore
        if (!window.go) return addToast("Not available in web mode", 'error');
        try {
            // @ts-ignore
            await window.go.main.App.CutFileToClipboard(pkg.filePath);
            addToast("File cut to clipboard", 'success');
        } catch (e) { console.error(e); }
    }, [addToast]);


    // -- Ratings & Favourites (user_metadata, keyed by family) --

    // Rating and favourite are version-agnostic: they attach to the whole family
    // (Creator.Name), so every physical copy in state is updated together.
    const familyOf = (pkg: VarPackage) => `${pkg.meta.creator}.${pkg.meta.packageName}`.toLowerCase();

    const patchFamily = useCallback((family: string, patch: Partial<VarPackage>) => {
        setPackages(prev => prev.map(p =>
            `${p.meta.creator}.${p.meta.packageName}`.toLowerCase() === family ? { ...p, ...patch } : p
        ));
    }, [setPackages]);

    // These set an EXPLICIT target value (not a toggle off a possibly-stale
    // snapshot): the caller owns the live value and passes what it should become,
    // so repeated clicks stay correct even while the menu is open.
    const setPackageRating = useCallback(async (pkg: VarPackage, rating: number) => {
        // @ts-ignore
        if (!window.go) return addToast("Ratings are available on the desktop app for now", 'info');
        const family = familyOf(pkg);
        const prev = pkg.rating ?? 0;
        patchFamily(family, { rating }); // optimistic
        try {
            // @ts-ignore
            await window.go.main.App.SetPackageRating(family, rating);
        } catch (e) {
            console.error(e);
            patchFamily(family, { rating: prev }); // rollback
            addToast("Failed to save rating: " + e, 'error');
        }
    }, [addToast, patchFamily]);

    const setPackageFavorite = useCallback(async (pkg: VarPackage, favorite: boolean) => {
        // @ts-ignore
        if (!window.go) return addToast("Favourites are available on the desktop app for now", 'info');
        const family = familyOf(pkg);
        const prev = !!pkg.isFavorite;
        patchFamily(family, { isFavorite: favorite }); // optimistic
        try {
            // @ts-ignore
            await window.go.main.App.SetPackageFavorite(family, favorite);
        } catch (e) {
            console.error(e);
            patchFamily(family, { isFavorite: prev }); // rollback
            addToast("Failed to update favourite: " + e, 'error');
        }
    }, [addToast, patchFamily]);

    return {
        // Actions
        togglePackage,
        handleBulkToggle,
        handleSidebarAction,
        handleGetDependencyStatus,
        handleInstantMerge,
        handleSingleResolve,
        handleConfirmOptimization,
        handleConfirmCollision,
        handleDeleteClick,
        handleExecuteDelete,
        handleOpenFolder,
        handleCopyPath,
        handleCopyFiles,
        handleCutFile,
        setPackageRating,
        setPackageFavorite,

        // Modal State
        installModal, setInstallModal,
        deleteConfirm, setDeleteConfirm,
        collisionData, setCollisionData,
        optimizationData, setOptimizationData,
        optimizationProgress, setOptimizationProgress
    };
};
