import React, { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { VarPackage } from '../../types';
import CardGrid from '../library/CardGrid';
import { Pagination } from '../../components/common/Pagination';
import RightSidebar from '../library/RightSidebar';
import { usePackageContext } from '../../context/PackageContext';
import { useFilterContext } from '../../context/FilterContext';
import { useSelectionContext } from '../../context/SelectionContext';
import { useLibraryContext } from '../../context/LibraryContext';
import { useActionContext } from '../../context/ActionContext';
import { useToasts } from '../../context/ToastContext';

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
    const { packages, scanError } = usePackageContext();
    const {
        filteredPkgs, currentPage, itemsPerPage, setCurrentPage,
        selectedCreator, setSelectedCreator
    } = useFilterContext();
    const {
        selectedIds, selectedPackage, setSelectedPackage,
        isDetailsPanelOpen, setIsDetailsPanelOpen,
        handlePackageClick, handleContextMenu, setSelectedIds
    } = useSelectionContext();
    const { activeLibraryPath } = useLibraryContext();
    const { handleSingleResolve, handleGetDependencyStatus } = useActionContext();
    const { addToast } = useToasts();

    // Local UI State
    const [activeTab, setActiveTab] = useState<"details" | "contents">("details");

    // Scroll to top on page change
    // Scroll Management (Top vs Locate)
    React.useEffect(() => {
        if (!scrollContainerRef.current) return;

        // If we have a highlight request, try to scroll to it first
        if (highlightedRequest) {
            const el = document.getElementById(`pkg-${highlightedRequest.id}`);
            if (el) {
                // Found it! Scroll to it.
                // We use a slight delay ensures layout is stable if this effect runs concurrently with render
                // We use requestAnimationFrame to ensure we scroll immediately after browser paint
                window.requestAnimationFrame(() => {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                });
                return;
            }
            // If not found yet (maybe looking for it on another page?), fall through to scroll top 
            // BUT, if we just switched pages to find it, it should be here.
        }

        // Default: Scroll to top on page switch
        scrollContainerRef.current.scrollTo({ top: 0, behavior: 'auto' });

        // Dependency Note: We include highlightedRequest to re-run if user clicks "Locate" again 
        // even if page doesn't change.
    }, [currentPage, scrollContainerRef, highlightedRequest]);

    const handleDependencyClick = (depId: string) => {
        const cleanDep = depId.replace(/\\/g, '/').toLowerCase();

        // 1. Try Path Match First (For "Used By" lookups where path is known)
        let found = packages.find(p => p.filePath.replace(/\\/g, '/').toLowerCase() === cleanDep);

        // 2. Try Exact ID Match (For "Dependency" lookups)
        if (!found) {
            found = packages.find(p => {
                const id = `${p.meta.creator}.${p.meta.packageName}.${p.meta.version}`;
                return id.toLowerCase() === cleanDep;
            });
        }

        // 3. Fallback / "Latest" Resolution
        if (!found) {
            let searchCreator = "";
            let searchPkg = "";
            let searchVersion = "";

            // Parsing Logic: Handle names with dots (e.g. Creator.My.Package.Name.1)
            // Strategy: Assume format is Creator.PackageName.Version
            // We split by FIRST dot for Creator, and LAST dot for Version.
            // Everything in between is PackageName.

            const firstDot = cleanDep.indexOf('.');
            const lastDot = cleanDep.lastIndexOf('.');

            if (firstDot > 0 && lastDot > firstDot) {
                searchCreator = cleanDep.substring(0, firstDot);
                searchPkg = cleanDep.substring(firstDot + 1, lastDot);
                searchVersion = cleanDep.substring(lastDot + 1);
            } else if (firstDot > 0) {
                // Fallback: Creator.Package (No version or latest implied)
                searchCreator = cleanDep.substring(0, firstDot);
                searchPkg = cleanDep.substring(firstDot + 1);
            }

            // Only attempt fallback if we successfully parsed a Creator and Package
            if (searchCreator && searchPkg) {
                // Determine if we should allow vague matching (finding ANY version)
                // We allow it ONLY if version is 'latest' or ambiguous.
                // We BLOCK it if a specific numeric version was requested but not found (Step 2 failed).
                const isExplicitVersion = !isNaN(parseInt(searchVersion)) && searchVersion !== 'latest';

                if (isExplicitVersion) {
                    addToast(`Specific version not found: ${depId}`, "error");
                    return; // STRICT MODE: Do not jump to different version
                }

                // If loose/latest, find best candidate
                const candidates = packages.filter(p =>
                    (p.meta.creator || "").toLowerCase() === searchCreator &&
                    (p.meta.packageName || "").toLowerCase() === searchPkg
                );

                if (candidates.length > 0) {
                    // Sort Descending (Newest First)
                    candidates.sort((a, b) => {
                        return (b.meta.version || "").localeCompare(a.meta.version || "", undefined, { numeric: true });
                    });
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
            const foundId = `${found.meta.creator}.${found.meta.packageName}.${found.meta.version}`;
            // If we found a match via Fuzzy/Latest logic, let the user know
            if (foundId.toLowerCase() !== cleanDep) {
                addToast(`Located latest available version: v${found.meta.version}`, "info");
            }
            onLocatePackage(found);
        } else {
            addToast(`Package not found in library: ${depId}`, "error");
        }
    };

    return (
        <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 flex flex-col overflow-hidden relative min-w-0">
                {scanError && (
                    <div className="bg-red-500/10 border-b border-red-500/20 p-4 flex items-center justify-center text-red-400 gap-3 shrink-0">
                        <AlertTriangle className="w-5 h-5" />
                        <span className="font-medium">Library Access Error: {scanError}</span>
                    </div>
                )}

                {/* CardGrid Container */}
                <div ref={scrollContainerRef} className="flex-1 overflow-auto p-4 pb-32 md:pb-24 custom-scrollbar">
                    <CardGrid
                        packages={filteredPkgs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)}
                        currentPath={activeLibraryPath}
                        totalCount={packages.length}
                        onContextMenu={handleContextMenu}
                        onSelect={handlePackageClick}
                        selectedPkgId={selectedPackage?.filePath}
                        selectedIds={selectedIds}
                        viewMode={viewMode}
                        gridSize={gridSize}
                        censorThumbnails={censorThumbnails}
                        blurAmount={blurAmount}
                        hidePackageNames={censorThumbnails && hidePackageNames}
                        hideCreatorNames={censorThumbnails && hideCreatorNames}
                        highlightedRequest={highlightedRequest}
                    />
                </div>

                {/* Pagination Footer */}
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
                {(selectedPackage && isDetailsPanelOpen) && (
                    <RightSidebar
                        pkg={selectedPackage}
                        onClose={() => {
                            setIsDetailsPanelOpen(false);
                            setSelectedPackage(null);
                            setSelectedIds(new Set()); // Clearing selection via Sidebar close? Usually sidebar implies selection.
                        }}
                        onResolve={(pkg) => handleSingleResolve(pkg)}
                        activeTab={activeTab}
                        onTabChange={setActiveTab}
                        onFilterByCreator={(c) => setSelectedCreator(c)}
                        onDependencyClick={handleDependencyClick}
                        onTitleClick={() => selectedPackage && onLocatePackage(selectedPackage)}
                        getDependencyStatus={handleGetDependencyStatus}
                        selectedCreator={selectedCreator}
                        censorThumbnails={censorThumbnails}
                        blurAmount={blurAmount}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};
