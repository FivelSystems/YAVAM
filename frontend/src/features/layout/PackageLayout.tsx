import React, { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
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
    highlightedPackageId?: string;
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
    highlightedPackageId, onLocatePackage, scrollContainerRef,
    censorThumbnails, blurAmount, hidePackageNames, hideCreatorNames
}) => {
    // Context Consumption
    const { packages } = usePackageContext();
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
    React.useEffect(() => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTo({ top: 0, behavior: 'auto' });
        }
    }, [currentPage, scrollContainerRef]);

    const handleDependencyClick = (depId: string) => {
        const cleanDep = depId.replace(/\\/g, '/').toLowerCase();

        // 1. Try Path Match First (For "Used By" lookups)
        let found = packages.find(p => p.filePath.replace(/\\/g, '/').toLowerCase() === cleanDep);

        // 2. Try Exact ID Match (For "Dependency" lookups)
        if (!found) {
            found = packages.find(p => {
                const id = `${p.meta.creator}.${p.meta.packageName}.${p.meta.version}`;
                return id.toLowerCase() === cleanDep;
            });
        }

        // 2. If not found, find Latest Available
        if (!found) {
            const parts = cleanDep.split('.');
            if (parts.length >= 2) {
                const creator = parts[0];
                const pkgName = parts[1];

                const candidates = packages.filter(p =>
                    (p.meta.creator || "").toLowerCase() === creator &&
                    (p.meta.packageName || "").toLowerCase() === pkgName
                );

                if (candidates.length > 0) {
                    // Sort Descending
                    candidates.sort((a, b) => {
                        const vA = parseInt(a.meta.version);
                        const vB = parseInt(b.meta.version);
                        if (!isNaN(vA) && !isNaN(vB)) return vB - vA;
                        return (b.meta.version || "").localeCompare(a.meta.version || "", undefined, { numeric: true });
                    });
                    found = candidates[0];
                }
            }
        }

        // 3. System check
        if (!found && cleanDep.startsWith("vam.core")) {
            addToast(`System Dependency: ${depId}`, "info");
            return;
        }

        if (found) {
            const foundId = `${found.meta.creator}.${found.meta.packageName}.${found.meta.version}`;
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
                {/* CardGrid Container */}
                <div ref={scrollContainerRef} className="flex-1 overflow-auto p-4 pb-24 custom-scrollbar">
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
                        highlightedPackageId={highlightedPackageId}
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
