import React, { createContext, useContext } from 'react';
import { usePackageActions } from '../hooks/usePackageActions';
import { usePackageContext } from './PackageContext';
import { useSelectionContext } from './SelectionContext';
import { useLibraryContext } from './LibraryContext';
import { useKeybindSubscription } from './KeybindContext';
import { useToasts } from './ToastContext';

// We need to match usePackageActions return type
interface ActionContextType {
    // Actions
    togglePackage: (pkg: any, merge?: boolean, silent?: boolean) => Promise<void>;
    handleBulkToggle: (pkg: any) => Promise<void>;
    handleSidebarAction: (action: 'enable-all' | 'disable-all' | 'resolve-all' | 'install-all', groupType: 'creator' | 'type' | 'status', key: string) => Promise<void>;
    handleGetDependencyStatus: (depId: string) => 'valid' | 'mismatch' | 'missing' | 'scanning' | 'system' | 'corrupt' | 'disabled';
    handleInstantMerge: (pkg: any, inPlace: boolean) => Promise<void>;
    handleSingleResolve: (pkg: any) => void;
    handleConfirmOptimization: (enableMerge: boolean, resolutionStrategy: 'latest' | 'manual' | 'none' | 'delete-older', manualPlan: any) => Promise<void>;
    handleConfirmCollision: () => void;
    handleDeleteClick: (pkg: any) => void;
    handleExecuteDelete: (files: string[]) => Promise<void>;
    handleOpenFolder: (pkg: any) => Promise<void>;
    handleCopyPath: (pkg: any) => Promise<void>;
    handleCopyFile: (pkg: any) => Promise<void>;
    handleCutFile: (pkg: any) => Promise<void>;

    // Modal State
    installModal: { open: boolean; pkgs: any[] };
    setInstallModal: (val: any) => void;
    deleteConfirm: { open: boolean; pkg: any; pkgs?: any[]; count?: number };
    setDeleteConfirm: (val: any) => void;
    collisionData: { open: boolean; pkg: any };
    setCollisionData: (val: any) => void;
    optimizationData: { open: boolean; mergePlan: any[]; resolveGroups: any[]; forceGlobalMode?: boolean; targetPackage?: any };
    setOptimizationData: (val: any) => void;
    optimizationProgress: { open: boolean; current: number; total: number; currentFile: string; spaceSaved: number; completed: boolean; errors: string[] };
    setOptimizationProgress: (val: any) => void;
}

const ActionContext = createContext<ActionContextType | undefined>(undefined);

export const ActionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const {
        packages, analyzePackages, setPackages, setLoading,
        scanPackages, setScanProgress
    } = usePackageContext();
    const { selectedIds, setSelectedIds, setSelectedPackage, selectedPackage } = useSelectionContext();
    const { activeLibraryPath } = useLibraryContext();
    const { addToast } = useToasts();

    const actionLogic = usePackageActions(
        packages,
        setPackages,
        activeLibraryPath,
        scanPackages,
        selectedIds,
        setSelectedIds,
        setSelectedPackage,
        addToast,
        analyzePackages,
        setLoading,
        setScanProgress
    );


    // Keybind: Delete
    // Keybind: Delete
    useKeybindSubscription('delete_selected', () => {
        if (selectedIds.size > 0) {
            // Recycle existing logic: calling handleDeleteClick with ANY selected package triggers the bulk delete logic.
            // If we have a selectedPackage (focused), use that. Otherwise find one.
            const target = (selectedPackage && selectedIds.has(selectedPackage.filePath))
                ? selectedPackage
                : packages.find(p => selectedIds.has(p.filePath));

            if (target) actionLogic.handleDeleteClick(target);
        }
    }, [selectedIds, packages, actionLogic, selectedPackage]);

    return (
        <ActionContext.Provider value={actionLogic}>
            {children}
        </ActionContext.Provider>
    );
};

export const useActionContext = () => {
    const context = useContext(ActionContext);
    if (!context) throw new Error("useActionContext must be used within ActionProvider");
    return context;
};
