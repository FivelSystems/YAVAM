import { VarPackage } from '../App';
import PackageCard from './PackageCard';
import { motion, AnimatePresence } from 'framer-motion';
import { PackageSearch } from 'lucide-react';

interface CardGridProps {
    packages: VarPackage[];
    currentPath?: string;
    totalCount?: number;
    onShowMissing: (pkg: VarPackage) => void;
    onResolve: (pkg: VarPackage) => void;
    onContextMenu: (e: React.MouseEvent, pkg: VarPackage) => void;
}

const CardGrid = ({ packages, currentPath, totalCount, onShowMissing, onResolve, onContextMenu }: CardGridProps) => {

    if (packages.length === 0) {
        // Distinguish between Empty Scan and Empty Filter
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
        <motion.div
            layout
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 pb-20 p-4"
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
                            onResolve={onResolve}
                            onShowMissing={onShowMissing}
                            onContextMenu={onContextMenu}
                        />
                    </motion.div>
                ))}
            </AnimatePresence>
        </motion.div>
    );
};

export default CardGrid;
