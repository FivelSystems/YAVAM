import { useState, useEffect, useRef } from 'react';

import Modal from '../../components/ui/Modal';
import SettingsSidebar, { SETTINGS_TABS } from './components/SettingsSidebar';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import ApplicationTab from './tabs/ApplicationTab';
import PrivacyTab from './tabs/PrivacyTab';
import NetworkTab from './tabs/NetworkTab';
import SecurityTab from './tabs/SecurityTab';
import AboutTab from './tabs/AboutTab';
import KeybindsTab from './tabs/KeybindsTab';

export type SettingsTab = 'application' | 'privacy' | 'network' | 'security' | 'keybinds' | 'about';

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
    onStartServer: () => void;
    onStopServer: () => void;
    publicAccess: boolean;
    onTogglePublicAccess: () => void;
    localIP: string;
    logs: string[];
    setLogs: React.Dispatch<React.SetStateAction<string[]>>;
    maxToasts: number;
    setMaxToasts: (val: number) => void;

    // Auth
    authPollInterval: number;
    setAuthPollInterval: (val: number) => void;



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
    onStartServer,
    onStopServer,
    publicAccess,
    onTogglePublicAccess,
    localIP,
    logs,
    setLogs,
    maxToasts,
    setMaxToasts,
    authPollInterval,
    setAuthPollInterval,

    handleClearData,
    addToast
}: SettingsDialogProps) => {

    const [activeTab, setActiveTab] = useState<SettingsTab | null>('application');
    const [appVersion, setAppVersion] = useState("");

    // Snapshot for Cancel/Revert
    const snapshotRef = useRef<{
        gridSize: number;
        itemsPerPage: number;
        minimizeOnClose: boolean;
        censorThumbnails: boolean;
        blurAmount: number;
        hidePackageNames: boolean;
        hideCreatorNames: boolean;
        maxToasts: number;
        serverPort: string;
        authPollInterval: number;
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
                serverPort,
                authPollInterval,
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
            setAuthPollInterval(s.authPollInterval);
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
        snapshotRef.current.serverPort !== serverPort ||
        snapshotRef.current.authPollInterval !== authPollInterval
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


    const renderTabContent = (tabId: SettingsTab | null) => {
        switch (tabId) {
            case 'application':
                return (
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
                );
            case 'privacy':
                return (
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
                );
            case 'network':
                return (
                    <NetworkTab
                        serverEnabled={serverEnabled}
                        onToggleServer={onToggleServer}
                        serverPort={serverPort}
                        setServerPort={setServerPort}
                        onStartServer={onStartServer}
                        onStopServer={onStopServer}
                        publicAccess={publicAccess}
                        onTogglePublicAccess={onTogglePublicAccess}
                        localIP={localIP}
                        logs={logs}
                        setLogs={setLogs}
                        isWeb={isWeb}
                        authPollInterval={authPollInterval}
                        setAuthPollInterval={setAuthPollInterval}
                    />
                );
            case 'security':
                return (
                    <SecurityTab
                        handleClearData={handleClearData}
                        addToast={addToast}
                    />
                );
            case 'keybinds':
                return (
                    <KeybindsTab />
                );
            case 'about':
                return <AboutTab appVersion={appVersion} />;
            default:
                return null;
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Settings"
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
                <div className="hidden md:block shrink-0 h-full">
                    <SettingsSidebar
                        activeTab={activeTab}
                        setActiveTab={setActiveTab}
                        isGuest={isGuest}
                        isMobile={false}
                        isWeb={isWeb}
                    />
                </div>

                {/* Content Area */}
                <div className="flex-1 h-full overflow-hidden flex flex-col bg-gray-900/50">

                    {/* Mobile Accordion View */}
                    <div className="md:hidden flex flex-col h-full overflow-y-auto overflow-x-hidden">
                        {SETTINGS_TABS.map(tab => {
                            if ((isGuest && tab.admin) || (isWeb && tab.webRestricted)) return null;
                            const isOpen = activeTab === tab.id;

                            return (
                                <div key={tab.id} className="border-b border-gray-800 last:border-0">
                                    <button
                                        onClick={() => setActiveTab(activeTab === tab.id ? null : tab.id as SettingsTab)}
                                        className={clsx(
                                            "w-full flex items-center justify-between p-4 text-left font-medium transition-colors",
                                            isOpen ? "bg-gray-800/50 text-white" : "text-gray-400 hover:text-gray-200"
                                        )}
                                    >
                                        <div className="flex items-center gap-3">
                                            <tab.icon size={20} />
                                            <span>{tab.label}</span>
                                        </div>
                                        <ChevronDown
                                            size={16}
                                            className={clsx("transition-transform duration-200", isOpen ? "rotate-180" : "")}
                                        />
                                    </button>

                                    {/* Content (Expanded) */}
                                    <AnimatePresence>
                                        {isOpen && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: "auto", opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.2 }}
                                                className="overflow-hidden"
                                            >
                                                <div className="p-4 bg-gray-900/30 border-t border-gray-800">
                                                    {renderTabContent(tab.id as SettingsTab)}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            );
                        })}
                    </div>

                    {/* Desktop Content View */}
                    <div className="hidden md:block flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar p-8">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeTab || "empty"}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.2 }}
                                className="h-full"
                            >
                                {activeTab ? renderTabContent(activeTab) : (
                                    <div className="flex items-center justify-center h-full text-gray-500">
                                        Select a tab to view settings
                                    </div>
                                )}
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default SettingsDialog;
