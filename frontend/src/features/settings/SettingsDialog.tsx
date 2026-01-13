import { useState, useEffect, useRef } from 'react';

import Modal from '../../components/ui/Modal';
import SettingsSidebar from './components/SettingsSidebar';
import ApplicationTab from './tabs/ApplicationTab';
import PrivacyTab from './tabs/PrivacyTab';
import NetworkTab from './tabs/NetworkTab';
import SecurityTab from './tabs/SecurityTab';
import AboutTab from './tabs/AboutTab';

export type SettingsTab = 'application' | 'privacy' | 'network' | 'security' | 'about';

interface SettingsDialogProps {
    isOpen: boolean;
    onClose: () => void;

    // Auth
    isGuest: boolean;
    isWeb: boolean;

    // App State
    gridSize: number;
    setGridSize: (size: number) => void;
    itemsPerPage: number;
    setItemsPerPage: (val: number) => void;
    minimizeOnClose: boolean;
    handleSetMinimize: (val: boolean) => void; // Wrapped in Dashboard

    // Privacy State (New)
    censorThumbnails: boolean;
    setCensorThumbnails: (val: boolean) => void;
    blurAmount: number;
    setBlurAmount: (val: number) => void;
    hidePackageNames: boolean;
    setHidePackageNames: (val: boolean) => void;
    hideCreatorNames: boolean;
    setHideCreatorNames: (val: boolean) => void;

    // Network State
    serverEnabled: boolean;
    onToggleServer: () => void;
    serverPort: string;
    setServerPort: (val: string) => void;
    publicAccess: boolean;
    onTogglePublicAccess: () => void;
    localIP: string;
    logs: string[];
    setLogs: React.Dispatch<React.SetStateAction<string[]>>;
    maxToasts: number;
    setMaxToasts: (val: number) => void;

    // Actions
    handleClearData: () => void;
    addToast: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

const SettingsDialog = ({
    isOpen,
    onClose,
    isGuest,
    isWeb,
    gridSize,
    setGridSize,
    itemsPerPage,
    setItemsPerPage,
    minimizeOnClose,
    handleSetMinimize,
    censorThumbnails,
    setCensorThumbnails,
    blurAmount,
    setBlurAmount,
    hidePackageNames,
    setHidePackageNames,
    hideCreatorNames,
    setHideCreatorNames,
    serverEnabled,
    onToggleServer,
    serverPort,
    setServerPort,
    publicAccess,
    onTogglePublicAccess,
    localIP,
    logs,
    setLogs,
    maxToasts,
    setMaxToasts,
    handleClearData,
    addToast
}: SettingsDialogProps) => {

    const [activeTab, setActiveTab] = useState<SettingsTab>('application');
    const [appVersion, setAppVersion] = useState("");

    // Snapshot for Cancel/Revert
    const snapshotRef = useRef<{
        gridSize: number;
        itemsPerPage: number;
        minimizeOnClose: boolean;
        censorThumbnails,
        blurAmount,
        hidePackageNames,
        hideCreatorNames,
        maxToasts: number;
        serverPort: string;
    } | null>(null);

    // Capture Snapshot on Open
    useEffect(() => {
        if (isOpen) {
            snapshotRef.current = {
                gridSize,
                itemsPerPage,
                minimizeOnClose,
                censorThumbnails,
                blurAmount,
                hidePackageNames,
                hideCreatorNames,
                maxToasts,
                serverPort
            };
        }
    }, [isOpen]);

    const handleCancel = () => {
        if (snapshotRef.current) {
            const s = snapshotRef.current;
            setGridSize(s.gridSize);
            setItemsPerPage(s.itemsPerPage);
            handleSetMinimize(s.minimizeOnClose);
            setCensorThumbnails(s.censorThumbnails);
            setBlurAmount(s.blurAmount);
            setHidePackageNames(s.hidePackageNames);
            setHideCreatorNames(s.hideCreatorNames);
            setMaxToasts(s.maxToasts);
            setServerPort(s.serverPort);
        }
        onClose();
    };

    const hasChanges = snapshotRef.current ? (
        snapshotRef.current.gridSize !== gridSize ||
        snapshotRef.current.itemsPerPage !== itemsPerPage ||
        snapshotRef.current.minimizeOnClose !== minimizeOnClose ||
        snapshotRef.current.censorThumbnails !== censorThumbnails ||
        snapshotRef.current.blurAmount !== blurAmount ||
        snapshotRef.current.hidePackageNames !== hidePackageNames ||
        snapshotRef.current.hideCreatorNames !== hideCreatorNames ||
        snapshotRef.current.maxToasts !== maxToasts ||
        snapshotRef.current.serverPort !== serverPort
    ) : false;

    // Version Fetch
    useEffect(() => {
        if (!isOpen) return;

        // @ts-ignore
        if (window.go && window.go.main && window.go.main.App) {
            // @ts-ignore
            window.go.main.App.GetAppVersion().then((v: string) => setAppVersion("v" + v));
        } else {
            fetch('/api/config')
                .then(r => r.json())
                .then(d => setAppVersion(d.version ? "v" + d.version + " (Web)" : "v1.1.4 (Web)"))
                .catch(() => setAppVersion("v1.1.4 (Web)"));
        }
    }, [isOpen]);

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose} // Clicking X behaves like "Save/Close" (Retention) or Cancel? usually X = Cancel.
            // Let's make X = HandleCancel for consistency if we strictly want revert.
            // But standard behavior for "Instant Apply" modals (like macOS system settings) is X = Keep changes.
            // If we have explicit "Cancel" button, X usually means "Close" (Keep).
            // Let's keep X as onClose (Keep).
            title={null}
            size="full"
            className="p-0 overflow-hidden bg-gray-900 border-gray-800"
            showCloseButton={true}
            footer={
                <div className="flex gap-3 w-full justify-end">
                    <button
                        onClick={handleCancel}
                        className="px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
                    >
                        {hasChanges ? "Cancel" : "Close"}
                    </button>
                    <button
                        onClick={onClose}
                        disabled={!hasChanges}
                        className={`px-6 py-2 rounded-lg text-sm font-bold text-white transition-all ${hasChanges
                            ? "bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-500/20"
                            : "bg-gray-700 opacity-50 cursor-not-allowed"
                            }`}
                    >
                        Save & Close
                    </button>
                </div>
            }
        >
            <div className="flex h-full">
                {/* Sidebar (Desktop) */}
                <div className="hidden md:block shrink-0">
                    <SettingsSidebar
                        activeTab={activeTab}
                        setActiveTab={setActiveTab}
                        isGuest={isGuest}
                        isMobile={false}
                    />
                </div>

                {/* Content Area */}
                <div className="flex-1 h-full overflow-hidden flex flex-col bg-gray-900/50">
                    {/* Mobile Tab Select (If we need it, or we rely on Sidebar becoming a drawer? 
                        For now, simple top-nav/pill list for mobile if not using sidebar) */}
                    <div className="md:hidden p-4 overflow-x-auto whitespace-nowrap border-b border-gray-800">
                        {/* Simple Mobile Nav Implementation */}
                        <div className="flex gap-2">
                            {(['application', 'privacy', 'network', 'security', 'about'] as SettingsTab[]).map(t => {
                                if ((t === 'network' || t === 'security') && isGuest) return null;
                                return (
                                    <button
                                        key={t}
                                        onClick={() => setActiveTab(t)}
                                        className={`px-3 py-1.5 rounded-full text-xs font-medium border ${activeTab === t ? 'bg-blue-600 border-blue-500 text-white' : 'border-gray-700 text-gray-400'}`}
                                    >
                                        {t.charAt(0).toUpperCase() + t.slice(1)}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8">
                        {activeTab === 'application' && (
                            <ApplicationTab
                                gridSize={gridSize}
                                setGridSize={setGridSize}
                                itemsPerPage={itemsPerPage}
                                setItemsPerPage={setItemsPerPage}
                                minimizeOnClose={minimizeOnClose}
                                setMinimizeOnClose={handleSetMinimize}
                                isWeb={isWeb}
                                maxToasts={maxToasts}
                                setMaxToasts={setMaxToasts}
                            />
                        )}
                        {activeTab === 'privacy' && (
                            <PrivacyTab
                                censorThumbnails={censorThumbnails}
                                setCensorThumbnails={setCensorThumbnails}
                                blurAmount={blurAmount}
                                setBlurAmount={setBlurAmount}
                                hidePackageNames={hidePackageNames}
                                setHidePackageNames={setHidePackageNames}
                                hideCreatorNames={hideCreatorNames}
                                setHideCreatorNames={setHideCreatorNames}
                            />
                        )}
                        {activeTab === 'network' && (
                            <NetworkTab
                                serverEnabled={serverEnabled}
                                onToggleServer={onToggleServer}
                                serverPort={serverPort}
                                setServerPort={setServerPort}
                                publicAccess={publicAccess}
                                onTogglePublicAccess={onTogglePublicAccess}
                                localIP={localIP}
                                logs={logs}
                                setLogs={setLogs}
                                isWeb={isWeb}
                            />
                        )}
                        {activeTab === 'security' && (
                            <SecurityTab
                                handleClearData={handleClearData}
                                addToast={addToast}
                            />
                        )}
                        {activeTab === 'about' && (
                            <AboutTab appVersion={appVersion} />
                        )}
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default SettingsDialog;
