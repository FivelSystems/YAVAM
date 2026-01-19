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
    highlightedPackageId?: string | null;
}

const CardGrid = ({ packages, currentPath, totalCount, onContextMenu, onSelect, selectedPkgId, selectedIds, viewMode, gridSize = 150, censorThumbnails = false, blurAmount = 10, hidePackageNames = false, hideCreatorNames = false, highlightedPackageId }: CardGridProps) => {

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

    // Animation Variants
    const itemVariants = {
        hidden: { opacity: 0, y: 20, scale: 0.95 },
        visible: {
            opacity: 1,
            y: 0,
            scale: 1,
            transition: {
                duration: 0.2, // Snappy uniform fade-in
                ease: "easeOut"
            }
        },
        exit: { opacity: 0, scale: 0.95, transition: { duration: 0.2 } }
    };

    return (
        <div ref={containerRef} className="h-full">
            <motion.div
                layout
                key={viewMode} // Forces re-mount on view switch to prevent morphing artifacts
                className={viewMode === 'list'
                    ? "flex flex-col gap-2 pb-20 p-4"
                    : "grid gap-4 pb-20 p-4"
                }
                style={viewMode === 'grid' ? {
                    gridTemplateColumns: `repeat(auto-fill, minmax(${gridSize}px, 1fr))`
                } : undefined}
            >
                <AnimatePresence mode="popLayout">
                    {packages.map((pkg, i) => (
                        <motion.div
                            layout
                            key={pkg.filePath}
                            id={`pkg-${pkg.filePath}`}
                            custom={i} // Pass index for stagger delay
                            variants={itemVariants}
                            initial="hidden"
                            animate="visible"
                            exit="exit"
                            className=""
                        >
                            <PackageCard
                                pkg={pkg}
                                onContextMenu={onContextMenu}
                                onSelect={onSelect}
                                isSelected={selectedIds ? selectedIds.has(pkg.filePath) : pkg.filePath === selectedPkgId}
                                isAnchor={pkg.filePath === selectedPkgId}
                                viewMode={viewMode}
                                censorThumbnails={censorThumbnails}
                                blurAmount={blurAmount}
                                hidePackageNames={hidePackageNames}
                                hideCreatorNames={hideCreatorNames}
                                isHighlighted={pkg.filePath === highlightedPackageId}
                            />
                        </motion.div>
                    ))}
                </AnimatePresence>
            </motion.div>
        </div>
    );

};

export default CardGrid;
