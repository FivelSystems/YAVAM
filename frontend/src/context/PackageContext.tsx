import React, { createContext, useContext, useEffect } from 'react';
import { usePackages } from '../hooks/usePackages';
import { useLibraryContext } from './LibraryContext';
import { useKeybindSubscription } from './KeybindContext';
import { VarPackage } from '../types';

interface PackageContextType {
    packages: VarPackage[];
    setPackages: (pkgs: VarPackage[]) => void;
    filteredPkgs: VarPackage[];
    setFilteredPkgs: (pkgs: VarPackage[]) => void;
    availableTags: string[];
    setAvailableTags: (tags: string[]) => void;
    loading: boolean;
    setLoading: (loading: boolean) => void;
    scanError: string | null;
    scanProgress: { current: number; total: number };
    setScanProgress: (progress: { current: number; total: number }) => void;
    scanPackages: () => Promise<void>;
    cancelScan: (options?: { resetLoading?: boolean }) => Promise<void>;
    creatorStatus: Record<string, "normal" | "warning" | "error">;
    typeStatus: Record<string, "normal" | "warning" | "error">;
    analyzePackages: (pkgs: VarPackage[]) => VarPackage[]; // Helper exposed?
    isCancelling: boolean;
}

const PackageContext = createContext<PackageContextType | undefined>(undefined);

export const PackageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { activeLibraryPath } = useLibraryContext();
    const packageLogic = usePackages(activeLibraryPath);

    // Keybind: Refresh
    useKeybindSubscription('refresh', () => {
        if (!packageLogic.loading) { // Reverted to packageLogic.loading to maintain syntactic correctness
            packageLogic.scanPackages();
        }
    }, [packageLogic.scanPackages, packageLogic.loading]); // Added packageLogic.loading to dependencies

    // Auto-scan when library changes?
    // Dashboard had this logic:
    // useEffect(() => { if (activeLibraryPath) handleScan(false); }, [activeLibraryPath]);
    // The hook usePackages itself doesn't auto-scan on path change, it just updates internal ref/state.
    // Dashboard useEffect triggered the scan. We should do it here.

    useEffect(() => {
        if (activeLibraryPath) {
            packageLogic.scanPackages();
        }
    }, [activeLibraryPath]);


    return (
        <PackageContext.Provider value={packageLogic}>
            {children}
        </PackageContext.Provider>
    );
};

export const usePackageContext = () => {
    const context = useContext(PackageContext);
    if (!context) throw new Error("usePackageContext must be used within PackageProvider");
    return context;
};
