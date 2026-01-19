import { useState } from 'react';
import { VarPackage } from '../types';

interface UseNavigationProps {
    filteredPkgs: VarPackage[];
    packages: VarPackage[];
    currentPage: number;
    setCurrentPage: (page: number) => void;
    itemsPerPage: number;
    addToast: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

export const useNavigation = ({
    filteredPkgs,
    packages,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    addToast
}: UseNavigationProps) => {

    const [highlightedPackageId, setHighlightedPackageId] = useState<string | null>(null);

    const handleLocatePackage = (targetPkg: VarPackage) => {
        // 1. Check visibility
        const index = filteredPkgs.findIndex(p => p.filePath === targetPkg.filePath);

        if (index === -1) {
            // It exists in global but not filtered?
            if (packages.find(p => p.filePath === targetPkg.filePath)) {
                addToast("Package is hidden by current filters/search", "warning");
            } else {
                addToast("Package not found", "error");
            }
            return;
        }

        // 2. Switch Page
        const targetPage = Math.floor(index / itemsPerPage) + 1;
        if (targetPage !== currentPage) {
            setCurrentPage(targetPage);
        }

        // 3. Highlight & Scroll
        setHighlightedPackageId(targetPkg.filePath);

        setTimeout(() => {
            const el = document.getElementById(`pkg-${targetPkg.filePath}`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 150);

        setTimeout(() => setHighlightedPackageId(null), 2000);
    };

    return {
        highlightedPackageId,
        setHighlightedPackageId,
        handleLocatePackage
    };
};
