import React, { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { VarPackage, DependencyLocation } from '../../types';
import CardGrid from '../library/CardGrid';
import { Pagination } from '../../components/common/Pagination';
import RightSidebar from '../library/RightSidebar';
import { ScanHoldNotice, ScanPendingNotice } from '../library/ScanGridNotices';
import { ErrorBanner, LibrariesLoadingNotice, NoLibrariesNotice } from '../library/LibraryStatusNotices';
import { usePackageContext } from '../../context/PackageContext';
import { useFilterContext } from '../../context/FilterContext';
import { useSelectionContext } from '../../context/SelectionContext';
import { useLibraryContext } from '../../context/LibraryContext';
import { useActionContext } from '../../context/ActionContext';
import { useToasts } from '../../context/ToastContext';
import { hasToken, toggleToken } from '../../utils/search';
import { isSamePath, normalizePath } from '../../utils/normalizePath';

interface PackageLayoutProps {
    // View State (Dashboard controlled)
    viewMode: 'grid' | 'list';
    gridSize: number;

    // Locating
    highlightedRequest?: { id: string; ts: number } | null;
    onLocatePackage: (pkg: VarPackage) => void;
    scrollContainerRef: React.RefObject<HTMLDivElement>;

    // Privacy
    censorThumbnails: boolean;
    blurAmount: number;
    hidePackageNames: boolean;
    hideCreatorNames: boolean;
}

export const PackageLayout: React.FC<PackageLayoutProps> = ({
    viewMode, gridSize,
    highlightedRequest, onLocatePackage, scrollContainerRef,
    censorThumbnails, blurAmount, hidePackageNames, hideCreatorNames
}) => {
    // Context Consumption
    const { packages, scanError, loading: isScanActive, scanSlots, scanStages } = usePackageContext();
    const {
        filteredPkgs, pendingCount, currentPage, itemsPerPage, goToPage, locatePackage,
        searchQuery, setSearchQuery, clearFilters
    } = useFilterContext();
    const {
        selectedIds, selectedPackage, setSelectedPackage,
        isDetailsPanelOpen, setIsDetailsPanelOpen,
        handlePackageClick, handleContextMenu, handleLongPress, setSelectedIds, setContextMenu
    } = useSelectionContext();
    const {
        activeLibraryPath, selectLibrary, libraries, hostLibrariesLoaded,
        libraryLoadFailed, reloadHostLibraries, browseAndAdd
    } = useLibraryContext();
    // @ts-ignore
    const canAddLibrary = Boolean(window.go);
    const { handleSingleResolve, handleGetDependencyStatus, setPackageRating, setPackageFavorite } = useActionContext();
    const { addToast } = useToasts();

    // Local UI State
    const [activeTab, setActiveTab] = useState<"details" | "contents">("details");

    const handleSidebarContextMenu = React.useCallback((e: React.MouseEvent, pkg: VarPackage) => {
        e.preventDefault();
        setContextMenu({
            open: true,
            x: e.clientX,
            y: e.clientY,
            pkg: pkg,
            mode: 'anchored'
        });
    }, [setContextMenu]);

    // Scroll to top on page change
    // Scroll Management (Top vs Locate)
    // -- Scroll Management --

    // 1. Scroll to Top on Page Change
    React.useEffect(() => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTo({ top: 0, behavior: 'auto' });
        }
    }, [currentPage, scrollContainerRef]);

    // 2. Scroll to Highlighted Package
    React.useEffect(() => {
        if (!highlightedRequest || !scrollContainerRef.current) return;

        const el = document.getElementById(`pkg-${highlightedRequest.id}`);
        if (el) {
            // Found it! Scroll to it.
            // We use requestAnimationFrame to ensure we scroll immediately after browser paint
            window.requestAnimationFrame(() => {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
        }
    }, [highlightedRequest, scrollContainerRef]);

    // Jump to whichever library holds `id`, then locate it there once it loads.
    // Resolves by family, so it lands on the best available version; when an exact
    // version was requested and differs, the toast says so. Shared by the
    // dependency-panel clicks and the sidebar title lookup.
    const jumpAcrossLibraries = (id: string, displayName: string, expectedVersion?: string) => {
        if (!window.go) {
            addToast(`Package not found in library: ${displayName}`, "error");
            return;
        }
        window.go.main.App.LocateDependencies([id])
            .then((map: Record<string, DependencyLocation>) => {
                const loc = map[id];
                if (!loc || !loc.found) {
                    addToast(`Not found in any library: ${displayName}`, "error");
                    return;
                }
                if (isSamePath(loc.libraryPath, activeLibraryPath)) {
                    addToast(`Package not found in library: ${displayName}`, "error");
                    return;
                }
                locatePackage(loc.filePath, loc.libraryPath);
                selectLibrary(loc.libraryPath);
                const versionNote = expectedVersion && (loc.version || "").toLowerCase() !== expectedVersion.toLowerCase()
                    ? ` — exact version not found, showing v${loc.version}`
                    : "";
                addToast(`Switching to “${loc.libraryLabel}” for ${loc.packageName || displayName}${versionNote}`, "info");
            })
            .catch(() => addToast(`Package not found: ${displayName}`, "error"));
    };

    // True lookup for the sidebar title: locate in the current library if present,
    // otherwise jump to the library that actually holds it. Fixes clicking the
    // title of a stale selection (from a previously-open library) navigating to a
    // page that has nothing.
    const handleLocate = (target: VarPackage) => {
        const targetId = `${target.meta.creator}.${target.meta.packageName}.${target.meta.version}`.toLowerCase();
        const inLibrary = packages.find(p =>
            isSamePath(p.filePath, target.filePath) ||
            `${p.meta.creator}.${p.meta.packageName}.${p.meta.version}`.toLowerCase() === targetId
        );
        if (inLibrary) {
            onLocatePackage(inLibrary);
            return;
        }
        jumpAcrossLibraries(targetId, target.meta.packageName || target.fileName);
    };

    const handleDependencyClick = (depId: string) => {
        const cleanDep = normalizePath(depId);
        let requestedVersion = ""; // explicit numeric version, if one was asked for

        // 1. Try Path Match First (For "Used By" lookups where path is known)
        let found = packages.find(p => normalizePath(p.filePath) === cleanDep);

        // 2. Try Exact ID Match (For "Dependency" lookups)
        if (!found) {
            found = packages.find(p => {
                const id = `${p.meta.creator}.${p.meta.packageName}.${p.meta.version}`;
                return id.toLowerCase() === cleanDep;
            });
        }

        // 3. Family fallback: resolve to the best AVAILABLE version in this library.
        //    We no longer dead-end on a version mismatch — the exact version is often
        //    not the copy installed. If we substitute, we warn below.
        if (!found) {
            let searchCreator = "";
            let searchPkg = "";
            let searchVersion = "";

            // Parse "Creator.PackageName.Version": first dot splits the creator,
            // last dot splits the version, the middle is the (possibly dotted) name.
            const firstDot = cleanDep.indexOf('.');
            const lastDot = cleanDep.lastIndexOf('.');
            if (firstDot > 0 && lastDot > firstDot) {
                searchCreator = cleanDep.substring(0, firstDot);
                searchPkg = cleanDep.substring(firstDot + 1, lastDot);
                searchVersion = cleanDep.substring(lastDot + 1);
            } else if (firstDot > 0) {
                searchCreator = cleanDep.substring(0, firstDot);
                searchPkg = cleanDep.substring(firstDot + 1);
            }
            if (!isNaN(parseInt(searchVersion)) && searchVersion !== 'latest') {
                requestedVersion = searchVersion;
            }

            if (searchCreator && searchPkg) {
                const candidates = packages.filter(p =>
                    (p.meta.creator || "").toLowerCase() === searchCreator &&
                    (p.meta.packageName || "").toLowerCase() === searchPkg
                );
                if (candidates.length > 0) {
                    candidates.sort((a, b) =>
                        (b.meta.version || "").localeCompare(a.meta.version || "", undefined, { numeric: true })
                    );
                    found = candidates[0];
                }
            }
        }

        // 4. System check
        if (!found && cleanDep.startsWith("vam.core")) {
            addToast(`System Dependency: ${depId}`, "info");
            return;
        }

        if (found) {
            // Warn only when we had to substitute a different version than requested.
            if (requestedVersion && (found.meta.version || "").toLowerCase() !== requestedVersion) {
                addToast(`Exact version not found (${depId}) — showing v${found.meta.version}`, "info");
            }
            onLocatePackage(found);
            return;
        }

        // 5. Not in this library — jump to whichever library holds the best copy.
        jumpAcrossLibraries(depId, depId, requestedVersion);
    };

    // Calculate View Slice & Off-Screen Status
    const currentSlice = filteredPkgs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    // Specifically check if selected package is visible in the CURRENT PAGE of the grid
    const isOffScreen = !!(selectedPackage && !currentSlice.some(p => p.filePath === selectedPackage.filePath));

    // selectedPackage is a snapshot taken at selection time; rating/favourite
    // edits patch the `packages` array in place, so the details panel must read
    // the live object by filePath instead of the stale selection reference.
    const livePackage = selectedPackage
        ? packages.find(p => p.filePath === selectedPackage.filePath) ?? selectedPackage
        : null;

    return (
        <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 flex flex-col overflow-hidden relative min-w-0">
                {libraryLoadFailed && (
                    <ErrorBanner
                        message="Couldn't load your libraries. Check the connection and try again."
                        actionLabel="Retry"
                        onAction={reloadHostLibraries}
                    />
                )}
                {scanError && <ErrorBanner message={`Library Access Error: ${scanError}`} />}

                <ScanPendingNotice count={pendingCount} />

                {/* CardGrid Container */}
                <div ref={scrollContainerRef} className="flex-1 overflow-auto p-4 custom-scrollbar">
                    {!hostLibrariesLoaded ? (libraryLoadFailed ? null : <LibrariesLoadingNotice />)
                    : libraries.length === 0 ? <NoLibrariesNotice onAddLibrary={canAddLibrary ? browseAndAdd : undefined} />
                    : scanSlots.phase === 'held' ? <ScanHoldNotice stages={scanStages} /> : <CardGrid
                        packages={currentSlice}
                        currentPath={activeLibraryPath}
                        totalCount={packages.length}
                        onContextMenu={handleContextMenu}
                        onSelect={handlePackageClick}
                        onRate={setPackageRating}
                        onToggleFavorite={setPackageFavorite}
                        onOpenActionSheet={handleLongPress}
                        selectedPkgId={selectedPackage?.filePath}
                        selectedIds={selectedIds}
                        viewMode={viewMode}
                        gridSize={gridSize}
                        censorThumbnails={censorThumbnails}
                        blurAmount={blurAmount}
                        hidePackageNames={censorThumbnails && hidePackageNames}
                        hideCreatorNames={censorThumbnails && hideCreatorNames}
                        highlightedRequest={highlightedRequest}
                        isFiltered={searchQuery.trim().length > 0}
                        onClearFilters={clearFilters}
                        isScanActive={isScanActive}
                    />}
                </div>

                {filteredPkgs.length > itemsPerPage && (
                    <div className="relative z-10 shrink-0 px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] bg-gray-900 border-t border-white/10">
                        <Pagination
                            currentPage={currentPage}
                            totalItems={filteredPkgs.length}
                            itemsPerPage={itemsPerPage}
                            onChange={goToPage}
                        />
                    </div>
                )}
            </div>

            <AnimatePresence>
                {(selectedPackage && isDetailsPanelOpen) && (
                    <RightSidebar
                        pkg={livePackage ?? selectedPackage}
                        onClose={() => {
                            setIsDetailsPanelOpen(false);
                            setSelectedPackage(null);
                            setSelectedIds(new Set()); // Clearing selection via Sidebar close? Usually sidebar implies selection.
                        }}
                        onResolve={(pkg) => handleSingleResolve(pkg)}
                        activeTab={activeTab}
                        onTabChange={setActiveTab}
                        onFilterByCreator={(c) => {
                            const name = c ?? selectedPackage?.meta.creator;
                            if (name) setSearchQuery(toggleToken(searchQuery, 'creator', name));
                        }}
                        onDependencyClick={handleDependencyClick}
                        onTitleClick={handleLocate}
                        getDependencyStatus={handleGetDependencyStatus}
                        selectedCreator={selectedPackage && hasToken(searchQuery, 'creator', selectedPackage.meta.creator) ? selectedPackage.meta.creator : null}
                        censorThumbnails={censorThumbnails}
                        blurAmount={blurAmount}
                        isOffScreen={isOffScreen}
                        onContextMenu={handleSidebarContextMenu}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};
