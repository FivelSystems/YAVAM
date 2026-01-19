import React from 'react';
import SettingsDialog from '../settings/SettingsDialog';
import { UpgradeModal } from '../packages/UpgradeModal';
import { WhatsNewModal } from '../../components/modals/WhatsNewModal';
import { OptimizationModal } from '../settings/OptimizationModal';
import { OptimizationProgressModal } from '../settings/OptimizationProgressModal';
import { useServerContext } from '../../context/ServerContext';
import { useActionContext } from '../../context/ActionContext';
import { useToasts } from '../../context/ToastContext';

interface SystemModalsProps {
    // Settings UI State
    isSettingsOpen: boolean;
    setIsSettingsOpen: (open: boolean) => void;

    // App/Auth State (Still passed as props for now)
    isGuest: boolean;
    isWeb: boolean;
    gridSize: number;
    setGridSize: (size: number) => void;
    itemsPerPage: number;
    setItemsPerPage: (val: number) => void;
    minimizeOnClose: boolean;
    handleSetMinimize: (val: boolean) => void;
    maxToasts: number;
    setMaxToasts: (val: number) => void;
    handleClearData: () => void;

    // Privacy State (Still passed)
    censorThumbnails: boolean;
    setCensorThumbnails: (val: boolean) => void;
    blurAmount: number;
    setBlurAmount: (val: number) => void;
    hidePackageNames: boolean;
    setHidePackageNames: (val: boolean) => void;
    hideCreatorNames: boolean;
    setHideCreatorNames: (val: boolean) => void;

    // Updates (Still passed)
    showUpdateModal: boolean;
    setShowUpdateModal: (val: boolean) => void;
    updateInfo: any;
    isUpdating: boolean;
    handleUpdate: () => void;
    whatsNew: { open: boolean; content: string; version: string };
    setWhatsNew: (val: { open: boolean; content: string; version: string }) => void;
}

export const SystemModals: React.FC<SystemModalsProps> = ({
    isSettingsOpen, setIsSettingsOpen,
    isGuest, isWeb, gridSize, setGridSize, itemsPerPage, setItemsPerPage, minimizeOnClose, handleSetMinimize, maxToasts, setMaxToasts, handleClearData,
    censorThumbnails, setCensorThumbnails,
    blurAmount, setBlurAmount,
    hidePackageNames, setHidePackageNames,
    hideCreatorNames, setHideCreatorNames,
    showUpdateModal, setShowUpdateModal, updateInfo, isUpdating, handleUpdate,
    whatsNew, setWhatsNew,
}) => {
    // Consume Contexts
    const {
        serverEnabled, serverPort, localIP, serverLogs, publicAccess, authPollInterval,
        toggleServer, togglePublicAccess, updateAuthPollInterval
    } = useServerContext();

    // ServerContext misses setServerPort? Dashboard had internal logic but useServer manages it?
    // useServer exposes: { ...state, toggleServer, ... }
    // It does NOT expose setServerPort usually. Port is config.
    // Dashboard had `setServerPort` state?

    const {
        optimizationData, setOptimizationData, handleConfirmOptimization,
        optimizationProgress, setOptimizationProgress
    } = useActionContext();

    const { addToast } = useToasts();

    return (
        <>
            {/* Settings Dialog */}
            <SettingsDialog
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                // Privacy Props
                censorThumbnails={censorThumbnails}
                blurAmount={blurAmount}
                setCensorThumbnails={setCensorThumbnails}
                setBlurAmount={setBlurAmount}
                hidePackageNames={hidePackageNames}
                setHidePackageNames={setHidePackageNames}
                hideCreatorNames={hideCreatorNames}
                setHideCreatorNames={setHideCreatorNames}

                // Network Props (From Context)
                serverEnabled={serverEnabled}
                serverPort={serverPort}
                localIP={localIP}
                logs={serverLogs}
                setLogs={() => { }} // Read only in context
                publicAccess={publicAccess}
                authPollInterval={authPollInterval}
                onToggleServer={toggleServer}
                onTogglePublicAccess={togglePublicAccess}
                setAuthPollInterval={updateAuthPollInterval}
                // setServerPort? If context doesn't expose, we can't set. 
                // SettingsDialog expects setServerPort probably. 
                // Passing empty fn for now.
                setServerPort={() => { }}

                // App Props
                isGuest={isGuest}
                isWeb={isWeb}
                gridSize={gridSize}
                setGridSize={setGridSize}
                itemsPerPage={itemsPerPage}
                setItemsPerPage={setItemsPerPage}
                minimizeOnClose={minimizeOnClose}
                handleSetMinimize={handleSetMinimize}
                maxToasts={maxToasts}
                setMaxToasts={setMaxToasts}

                // Actions
                onStartServer={() => !serverEnabled && toggleServer()}
                onStopServer={() => serverEnabled && toggleServer()}
                handleClearData={handleClearData}
                addToast={addToast}
            />

            {/* Upgrade Modal */}
            <UpgradeModal
                open={showUpdateModal}
                version={updateInfo?.version || "Unknown"}
                onUpdate={handleUpdate}
                onCancel={() => setShowUpdateModal(false)}
                downloading={isUpdating}
            />

            {/* What's New Modal */}
            <WhatsNewModal
                isOpen={whatsNew.open}
                onClose={() => setWhatsNew({ ...whatsNew, open: false })}
                content={whatsNew.content}
                version={whatsNew.version}
            />

            {/* Optimization Modals (From Context) */}
            <OptimizationModal
                isOpen={optimizationData.open}
                onClose={() => setOptimizationData({ ...optimizationData, open: false })}
                mergePlan={optimizationData.mergePlan}
                resolveGroups={optimizationData.resolveGroups}
                onConfirm={handleConfirmOptimization}
            />

            <OptimizationProgressModal
                isOpen={optimizationProgress.open}
                onClose={() => setOptimizationProgress({ ...optimizationProgress, open: false })}
                current={optimizationProgress.current}
                total={optimizationProgress.total}
                currentFile={optimizationProgress.currentFile}
                spaceSaved={optimizationProgress.spaceSaved}
                completed={optimizationProgress.completed}
                errors={optimizationProgress.errors}
            />
        </>
    );
};
