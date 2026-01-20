import React from 'react';
import { InstallPackageModal } from './InstallPackageModal';
import { DeletePackageModal } from './DeletePackageModal';
import { UploadModal } from '../upload/UploadModal';
import { useActionContext } from '../../context/ActionContext';
import { usePackageContext } from '../../context/PackageContext';
import { useLibraryContext } from '../../context/LibraryContext';
import { useToasts } from '../../context/ToastContext';

interface PackageActionModalsProps {
    // Upload Props (From Dashboard useDragDrop)
    isUploadModalOpen: boolean;
    setIsUploadModalOpen: (val: boolean) => void;
    uploadQueue: (File | string)[];
    setUploadQueue: (files: (File | string)[]) => void;
    onUploadSuccess: () => void;
}

export const PackageActionModals: React.FC<PackageActionModalsProps> = ({
    isUploadModalOpen, setIsUploadModalOpen,
    uploadQueue, setUploadQueue, onUploadSuccess
}) => {
    // Consumer Logic for Install
    const { installModal, setInstallModal, deleteConfirm, setDeleteConfirm, handleExecuteDelete } = useActionContext();
    const { packages, scanPackages } = usePackageContext();
    const { libraries, activeLibraryPath, selectLibrary } = useLibraryContext();
    const { addToast } = useToasts();

    return (
        <>
            {/* Install Modal */}
            <InstallPackageModal
                isOpen={installModal.open}
                onClose={() => setInstallModal({ open: false, pkgs: [] })}
                packages={installModal.pkgs}
                allPackages={packages}
                libraries={libraries}
                currentLibrary={activeLibraryPath}
                onSuccess={(res) => {
                    addToast(`Installed ${res.installed} packages to ${res.targetLib}` + (res.skipped > 0 ? ` (${res.skipped} skipped)` : ""), 'success');

                    if (res.switchTo) {
                        // User requested to switch libraries. Logic handles scan via Effect.
                        selectLibrary(res.targetLib);
                    } else if (res.targetLib === activeLibraryPath) {
                        // Stayed on same lib, but it was the install target, so refresh.
                        scanPackages();
                    }
                }}
            />

            {/* Delete Modal */}
            <DeletePackageModal
                isOpen={deleteConfirm.open}
                onClose={() => setDeleteConfirm({ open: false, pkg: null })}
                onConfirm={handleExecuteDelete}
                packagesToDelete={
                    deleteConfirm.pkgs && deleteConfirm.pkgs.length > 0
                        ? deleteConfirm.pkgs.map(p => p.filePath)
                        : (deleteConfirm.pkg ? [deleteConfirm.pkg.filePath] : [])
                }
            />

            {/* Upload Modal */}
            <UploadModal
                isOpen={isUploadModalOpen}
                onClose={() => setIsUploadModalOpen(false)}
                initialFiles={uploadQueue}
                onAppendFiles={(_: any) => setUploadQueue([])}
                libraries={libraries}
                initialLibrary={activeLibraryPath}
                onSuccess={onUploadSuccess}
            />
        </>
    );
};
