import React from 'react';
import { AnimatePresence } from 'framer-motion';
import { Toast, ToastItem } from '../../components/ui/Toast';
import DragDropOverlay from '../upload/DragDropOverlay';
import ContextMenu from '../../components/ui/ContextMenu';
import { VarPackage } from '../../types';

interface GlobalOverlaysProps {
    // Toasts
    toasts: ToastItem[];
    onRemoveToast: (id: string) => void;

    // Drag Drop
    onDrop: (files: string[]) => void;
    onWebUpload: (files: FileList | File[]) => void;

    // Context Menu
    contextMenu: {
        open: boolean;
        x: number;
        y: number;
        pkg: VarPackage | null;
    };
    setContextMenu: (val: any) => void;
    selectedIds: Set<string>;
    packages: VarPackage[];

    // Actions
    onToggle: (pkg: VarPackage) => void;
    onOpenFolder: (pkg: VarPackage) => void;
    onInstall: (pkg: VarPackage, selectedIds: Set<string>) => void;
    onCopyPath: (pkg: VarPackage) => void;
    onCopyFile: (pkg: VarPackage) => void;
    onCutFile: (pkg: VarPackage) => void;
    onDelete: (pkg: VarPackage) => void;
    onMerge: (pkg: VarPackage) => void;
    onMergeInPlace: (pkg: VarPackage) => void;
    onResolve: (pkg: VarPackage) => void;
}

export const GlobalOverlays: React.FC<GlobalOverlaysProps> = ({
    toasts, onRemoveToast,
    onDrop, onWebUpload,
    contextMenu, setContextMenu, selectedIds,
    onToggle, onOpenFolder, onInstall,
    onCopyPath, onCopyFile, onCutFile, onDelete,
    onMerge, onMergeInPlace, onResolve
}) => {
    return (
        <>
            <DragDropOverlay onDrop={onDrop} onWebUpload={onWebUpload} />

            {/* Context Menu */}
            {contextMenu.open && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    pkg={contextMenu.pkg}
                    selectedCount={selectedIds.size}
                    onClose={() => setContextMenu({ ...contextMenu, open: false })}
                    onToggle={onToggle}
                    onOpenFolder={onOpenFolder}
                    onDownload={(pkg) => onInstall(pkg, selectedIds)}
                    onCopyPath={onCopyPath}
                    onCopyFile={onCopyFile}
                    onCutFile={onCutFile}
                    onDelete={onDelete}
                    onMerge={onMerge}
                    onMergeInPlace={onMergeInPlace}
                    onResolve={onResolve}
                />
            )}

            {/* Toasts Container */}
            <div className="fixed bottom-20 right-4 z-50 flex flex-col items-end pointer-events-none">
                <AnimatePresence>
                    {toasts.map(toast => (
                        <Toast key={toast.id} toast={toast} onRemove={onRemoveToast} />
                    ))}
                </AnimatePresence>
            </div>
        </>
    );
};
