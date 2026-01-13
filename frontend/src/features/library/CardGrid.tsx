import { useRef } from 'react';
import { VarPackage } from '../../types';
import PackageCard from './PackageCard';
import { motion, AnimatePresence } from 'framer-motion';
import { PackageSearch } from 'lucide-react';

interface CardGridProps {
    packages: VarPackage[];
    currentPath?: string;
    totalCount?: number;
    onContextMenu: (e: React.MouseEvent, pkg: VarPackage) => void;
    onSelect: (pkg: VarPackage, e?: React.MouseEvent) => void;
    selectedPkgId?: string;
    selectedIds?: Set<string>;
    viewMode: 'grid' | 'list';
    gridSize?: number;
    censorThumbnails?: boolean;
    blurAmount?: number;
    hidePackageNames?: boolean;
    hideCreatorNames?: boolean;
}

const CardGrid = ({ packages, currentPath, totalCount, onContextMenu, onSelect, selectedPkgId, selectedIds, viewMode, gridSize = 150, censorThumbnails = false, blurAmount = 10, hidePackageNames = false, hideCreatorNames = false }: CardGridProps) => {

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
            <div className="h-full flex flex-col items-center justify-center text-gray-500">
                <p className="text-lg">No matching packages.</p>
                <p className="text-sm">Try adjusting your filters or search query.</p>
            </div>
        )
    }

    return (
        <div ref={containerRef} className="h-full">
            <motion.div
                layout
                className={viewMode === 'list'
                    ? "flex flex-col gap-2 pb-20 p-4"
                    : "grid gap-4 pb-20 p-4"
                }
                style={viewMode === 'grid' ? {
                    gridTemplateColumns: `repeat(auto-fill, minmax(${gridSize}px, 1fr))`
                } : undefined}
            >
                <AnimatePresence mode="popLayout">
                    {packages.map((pkg) => (
                        <motion.div
                            layout
                            key={pkg.filePath}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                        >
                            <PackageCard
                                pkg={pkg}
                                onContextMenu={onContextMenu}
                                onSelect={onSelect}
                                isSelected={selectedIds ? selectedIds.has(pkg.filePath) : pkg.filePath === selectedPkgId}
                                viewMode={viewMode}
                                censorThumbnails={censorThumbnails}
                                blurAmount={blurAmount}
                                hidePackageNames={hidePackageNames}
                                hideCreatorNames={hideCreatorNames}
                            />
                        </motion.div>
                    ))}
                </AnimatePresence>
            </motion.div>
        </div>
    );
};

export default CardGrid;
