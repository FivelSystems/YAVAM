import { useRef } from 'react';
import { VarPackage } from '../../types';
import PackageCard from './PackageCard';
import { PackageSearch, X } from 'lucide-react';

interface CardGridProps {
    packages: VarPackage[];
    currentPath?: string;
    totalCount?: number;
    onContextMenu: (e: React.MouseEvent, pkg: VarPackage) => void;
    onSelect: (pkg: VarPackage, e?: React.MouseEvent) => void;
    onRate: (pkg: VarPackage, rating: number) => void;
    onToggleFavorite: (pkg: VarPackage, favorite: boolean) => void;
    onOpenActionSheet: (pkg: VarPackage) => void;
    selectedPkgId?: string;
    selectedIds?: Set<string>;
    viewMode: 'grid' | 'list';
    gridSize?: number;
    censorThumbnails?: boolean;
    blurAmount?: number;
    hidePackageNames?: boolean;
    hideCreatorNames?: boolean;
    highlightedRequest?: { id: string; ts: number } | null;
    /** True when a search/status/creator/etc. filter is currently narrowing the
     * list — lets the empty state offer an inline way out (#57). */
    isFiltered?: boolean;
    onClearFilters?: () => void;
    isScanActive?: boolean;
}

const CardGrid = ({ packages, currentPath, totalCount, onContextMenu, onSelect, onRate, onToggleFavorite, onOpenActionSheet, selectedPkgId, selectedIds, viewMode, gridSize = 150, censorThumbnails = false, blurAmount = 10, hidePackageNames = false, hideCreatorNames = false, highlightedRequest, isFiltered = false, onClearFilters, isScanActive = false }: CardGridProps) => {

    const containerRef = useRef<HTMLDivElement>(null);


    if (packages.length === 0) {
        // ... (Empty state logic, unchanged)
        if (totalCount === 0) {
            return (
                <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-2 p-4 text-center">
                    <PackageSearch size={48} className="mb-4 opacity-50" />
                    <p className="text-lg font-semibold">No packages found.</p>
                    <p className="text-sm max-w-md">
                        We scanned <span className="text-gray-400 font-mono bg-gray-800 px-1 rounded break-all">{currentPath}</span>
                        <br />but found no .var files in this location.
                    </p>
                    <p className="text-xs text-gray-600 mt-4">
                        Select a folder containing .var files (subfolders are scanned).
                    </p>
                </div>
            )
        }
        return (
            <div className="h-full flex flex-col items-center justify-center text-gray-500 gap-3">
                <p className="text-lg">No matching packages.</p>
                <p className="text-sm">Try adjusting your filters or search query.</p>
                {isFiltered && onClearFilters && (
                    <button
                        onClick={onClearFilters}
                        className="mt-1 flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gray-800 hover:bg-gray-700 border border-gray-700 text-sm text-gray-300 hover:text-white transition-colors"
                    >
                        <X size={14} /> Clear all filters
                    </button>
                )}
            </div>
        )
    }

    return (
        <div ref={containerRef} className="h-full">
            <div
                key={viewMode}
                className={viewMode === 'list'
                    ? "flex flex-col gap-2 pb-20 p-4"
                    : "grid gap-4 pb-20 p-4"
                }
                style={viewMode === 'grid' ? {
                    gridTemplateColumns: `repeat(auto-fill, minmax(${gridSize}px, 1fr))`
                } : undefined}
            >
                {packages.map((pkg) => (
                    // min-w-0: grid items default to min-width: auto, so unbreakable card
                    // content (long VaM filenames) would inflate a track past its minmax().
                    <div
                        key={pkg.filePath}
                        id={`pkg-${pkg.filePath}`}
                        className="min-w-0"
                    >
                        <PackageCard
                            pkg={pkg}
                            onContextMenu={onContextMenu}
                            onSelect={onSelect}
                            onRate={onRate}
                            onToggleFavorite={onToggleFavorite}
                            onOpenActionSheet={onOpenActionSheet}
                            isSelected={selectedIds ? selectedIds.has(pkg.filePath) : pkg.filePath === selectedPkgId}
                            isAnchor={pkg.filePath === selectedPkgId}
                            viewMode={viewMode}
                            censorThumbnails={censorThumbnails}
                            blurAmount={blurAmount}
                            hidePackageNames={hidePackageNames}
                            hideCreatorNames={hideCreatorNames}
                            isHighlighted={highlightedRequest?.id === pkg.filePath}
                            startAnimationTs={highlightedRequest?.id === pkg.filePath ? highlightedRequest.ts : undefined}
                            isScanActive={isScanActive}
                        />
                    </div>
                ))}
            </div>
        </div>
    );

};

export default CardGrid;
