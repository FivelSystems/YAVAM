import { useState, useEffect, useRef } from 'react';
import { X, LayoutGrid, Network, Terminal, AlertTriangle, ExternalLink, HardDrive, Palette, AppWindow, Info, Github, Save, Check, FolderOpen, Trash2, Keyboard, EyeOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from 'clsx';


// Helper for Key Recording
const KeybindButton = ({ currentKey, onUpdate }: { currentKey: string, onUpdate: (k: string) => void }) => {
    const [isListening, setIsListening] = useState(false);

    useEffect(() => {
        if (!isListening) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();

            if (e.key === 'Escape') {
                setIsListening(false);
                return;
            }

            // simplistic key capture
            let key = e.key;
            if (key === ' ') key = 'Space';
            if (key.length === 1) key = key.toUpperCase();

            onUpdate(key);
            setIsListening(false);
        };

        window.addEventListener('keydown', handleKeyDown, true); // Capture phase to prevent bubbling
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [isListening, onUpdate]);

    return (
        <button
            onClick={() => setIsListening(true)}
            className={clsx(
                "px-3 py-1.5 rounded-lg text-sm font-mono border shadow-sm min-w-[60px] text-center transition-all",
                isListening
                    ? "bg-red-600/20 border-red-500 text-red-400 animate-pulse"
                    : "bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white"
            )}
        >
            {isListening ? "Press Key..." : currentKey || "Unbound"}
        </button>
    );
};

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    // General Tab
    gridSize: number;
    setGridSize: (size: number) => void;
    itemsPerPage: number;
    setItemsPerPage: (val: number) => void;
    censorThumbnails: boolean;
    setCensorThumbnails: React.Dispatch<React.SetStateAction<boolean>>;
    keybinds: { [key: string]: string };
    onUpdateKeybind: (action: string, key: string) => void;
    // Server Tab
    serverEnabled: boolean;
    onToggleServer: () => void;
    serverPort: string;
    setServerPort: (port: string) => void;
    localIP: string;
    logs: string[];
    setLogs: React.Dispatch<React.SetStateAction<string[]>>;
    isWeb: boolean;
}

const SettingsModal = ({
    isOpen,
    onClose,
    gridSize,
    setGridSize,
    itemsPerPage,
    setItemsPerPage,
    censorThumbnails,
    setCensorThumbnails,
    keybinds,
    onUpdateKeybind,
    serverEnabled,
    onToggleServer,
    serverPort,
    setServerPort,
    localIP,
    logs,
    setLogs,
    isWeb,
}: SettingsModalProps) => {

    const [activeTab, setActiveTab] = useState<'dashboard' | 'general' | 'appearance' | 'keybinds' | 'network' | 'storage' | 'about'>('general');

    // Capture initial state for Revert logic
    const [initialValues, setInitialValues] = useState<{
        gridSize: number;
        itemsPerPage: number;
        minimizeOnClose: boolean;
        censorThumbnails: boolean;
    } | null>(null);

    const [minimizeOnClose, setMinimizeOnClose] = useState(() => localStorage.getItem('minimizeOnClose') === 'true');
    const [appVersion, setAppVersion] = useState("");
    const [hasChanges, setHasChanges] = useState(false);

    // On Open: Snapshot headers
    useEffect(() => {
        if (isOpen) {
            const currentMinimize = localStorage.getItem('minimizeOnClose') === 'true';
            setInitialValues({
                gridSize,
                itemsPerPage,
                minimizeOnClose: currentMinimize,
                censorThumbnails
            });
            setMinimizeOnClose(currentMinimize);
            setHasChanges(false);
        }
    }, [isOpen]);

    // Check for dirty state
    useEffect(() => {
        if (!initialValues) return;
        const isDirty =
            gridSize !== initialValues.gridSize ||
            itemsPerPage !== initialValues.itemsPerPage ||
            minimizeOnClose !== initialValues.minimizeOnClose ||
            censorThumbnails !== initialValues.censorThumbnails;
        setHasChanges(isDirty);
    }, [gridSize, itemsPerPage, minimizeOnClose, censorThumbnails, initialValues]);


    useEffect(() => {
        // @ts-ignore
        if (window.go && window.go.main && window.go.main.App) {
            // @ts-ignore
            window.go.main.App.GetAppVersion().then(v => setAppVersion("v" + v));
        } else {
            // Web Mode: Fetch version from backend config
            fetch('/api/config')
                .then(r => r.json())
                .then(data => {
                    if (data && data.version) {
                        setAppVersion("v" + data.version + " (Web)");
                    } else {
                        setAppVersion("v1.1.4-e (Web)"); // Fallback if missing
                    }
                })
                .catch(() => setAppVersion("v1.1.4-e (Web)"));
        }
    }, []);

    const logEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (logEndRef.current) logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }, [logs]);

    const tabs = [
        { id: 'general', label: 'General', icon: AppWindow },
        { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
        { id: 'appearance', label: 'Appearance', icon: Palette },
        { id: 'keybinds', label: 'Keybinds', icon: Keyboard },
        ...(!isWeb ? [
            { id: 'storage', label: 'Storage', icon: HardDrive },
            { id: 'network', label: 'Network', icon: Network },
        ] : []),
        { id: 'about', label: 'About', icon: Info },
    ] as const;

    const handleClearData = async () => {
        if (!confirm("Are you sure you want to clear ALL data? This will reset all settings, thumbnails, and application state.\n\nThe application will close immediately.")) return;

        localStorage.clear();
        try {
            // @ts-ignore
            if (window.go) await window.go.main.App.ClearAppData();
        } catch (e) {
            console.error("Failed to clear app data", e);
        }

        // @ts-ignore
        if (window.runtime) window.runtime.Quit();
        else window.location.reload();
    };

    const handleSetMinimize = (val: boolean) => {
        setMinimizeOnClose(val);
        localStorage.setItem('minimizeOnClose', val.toString());
        // @ts-ignore
        if (window.go) window.go.main.App.SetMinimizeOnClose(val);
    };

    const handleSetCensor = (val: boolean) => {
        setCensorThumbnails(val);
        localStorage.setItem('censorThumbnails', val.toString());
    };

    const handleApply = () => {
        // Commit changes (Persist what might not be persisted)
        localStorage.setItem('gridSize', gridSize.toString());
        // itemsPerPage and minimizeOnClose are likely persisted on change, but ensure it.
        localStorage.setItem('itemsPerPage', itemsPerPage.toString());

        // Update snapshot to current, so Cancel now reverts to THIS state.
        setInitialValues({
            gridSize,
            itemsPerPage,
            minimizeOnClose,
            censorThumbnails
        });
        setHasChanges(false); // Disable Apply button until new changes
    };

    const handleSaveAndClose = () => {
        handleApply();
        onClose();
    };

    const handleCancel = () => {
        if (initialValues) {
            // Revert all to initial
            setGridSize(initialValues.gridSize);
            setItemsPerPage(initialValues.itemsPerPage);

            // Revert Minimize
            handleSetMinimize(initialValues.minimizeOnClose);
            setCensorThumbnails(initialValues.censorThumbnails);
        }
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl h-[600px] max-h-[90vh] border border-gray-700 overflow-hidden flex flex-col"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 border-b border-gray-700 shrink-0">
                            <h3 className="text-lg font-semibold text-white">Settings</h3>
                            <button onClick={handleCancel} className="p-1 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Content Layout */}
                        <div className="flex flex-1 overflow-hidden">
                            {/* Sidebar */}
                            <div className="w-48 bg-gray-800/50 border-r border-gray-700 p-2 space-y-1">
                                {tabs.map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id as any)}
                                        className={clsx(
                                            "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                                            activeTab === tab.id
                                                ? "bg-blue-600/10 text-blue-400"
                                                : "text-gray-400 hover:bg-gray-700 hover:text-white"
                                        )}
                                    >
                                        <tab.icon size={18} />
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {/* Main Panel */}
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">

                                {/* DASHBOARD TAB */}
                                {activeTab === 'dashboard' && (
                                    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                                        <div>
                                            <h4 className="text-lg font-medium text-white mb-1">Dashboard</h4>
                                            <p className="text-sm text-gray-500 mb-4">Customize your viewing experience.</p>

                                            <div className="space-y-6">
                                                {/* Grid Size */}
                                                <div>
                                                    <div className="flex justify-between items-center mb-2">
                                                        <label className="text-sm text-gray-300 font-medium">Card Grid Size</label>
                                                        <span className="text-xs text-gray-500 bg-gray-700 px-2 py-0.5 rounded">{gridSize}px</span>
                                                    </div>
                                                    <input
                                                        type="range"
                                                        min="100"
                                                        max="300"
                                                        step="10"
                                                        value={gridSize}
                                                        onChange={(e) => setGridSize(parseInt(e.target.value))}
                                                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                                    />
                                                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                                                        <span>Compact</span>
                                                        <span>Large</span>
                                                    </div>
                                                </div>

                                                {/* Items Per Page */}
                                                <div className="pt-4 border-t border-gray-700">
                                                    <div className="flex justify-between items-start mb-1">
                                                        <div className="space-y-1">
                                                            <label className="text-sm text-gray-300 font-medium block">Packages Per Page</label>
                                                            <p className="text-xs text-gray-500">Default: 25</p>
                                                        </div>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            value={itemsPerPage}
                                                            onChange={(e) => setItemsPerPage(Math.max(1, parseInt(e.target.value) || 1))}
                                                            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none w-24 text-center"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* APPEARANCE TAB */}
                                {activeTab === 'appearance' && (
                                    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                                        <div>
                                            <h4 className="text-lg font-medium text-white mb-1">Appearance</h4>
                                            <p className="text-sm text-gray-500 mb-4">Personalize the application theme.</p>

                                            <div className="bg-black/30 rounded-xl p-6 border border-gray-700/50 flex flex-col items-center justify-center text-center space-y-4">
                                                <Palette size={48} className="text-gray-600" />
                                                <div>
                                                    <h5 className="text-gray-300 font-medium">Coming Soon</h5>
                                                    <p className="text-sm text-gray-500 max-w-xs mx-auto mt-1">
                                                        Theme switching and accent color customization will be available in a future update.
                                                    </p>
                                                </div>
                                                {/* Placeholder for future theme switcher */}
                                                <div className="flex gap-2 mt-2 opacity-50 grayscale pointer-events-none">
                                                    <div className="w-8 h-8 rounded-full bg-blue-600 border-2 border-white/50"></div>
                                                    <div className="w-8 h-8 rounded-full bg-green-600"></div>
                                                    <div className="w-8 h-8 rounded-full bg-purple-600"></div>
                                                    <div className="w-8 h-8 rounded-full bg-red-600"></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* GENERAL TAB */}
                                {activeTab === 'general' && (
                                    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                                        <div>
                                            <h4 className="text-lg font-medium text-white mb-1">General Application Settings</h4>
                                            <p className="text-sm text-gray-500 mb-4">Configure system behavior.</p>

                                            {!isWeb ? (
                                                <div className="space-y-4">
                                                    <div className="bg-gray-700/30 rounded-xl p-4 border border-gray-700/50">
                                                        <div className="flex items-center justify-between">
                                                            <div>
                                                                <h4 className="text-sm font-medium text-white">Run in Background</h4>
                                                                <p className="text-xs text-gray-500">Hide window on close but keep server running. Restore via System Tray.</p>
                                                            </div>
                                                            <button
                                                                onClick={() => handleSetMinimize(!minimizeOnClose)}
                                                                className={clsx(
                                                                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                                                                    minimizeOnClose ? "bg-blue-600" : "bg-gray-700"
                                                                )}
                                                            >
                                                                <span className={clsx(
                                                                    "inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200",
                                                                    minimizeOnClose ? "translate-x-6" : "translate-x-1"
                                                                )} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : null}

                                            {/* Censor Thumbnails (Available for Web & Desktop) */}
                                            <div className="bg-gray-700/30 rounded-xl p-4 border border-gray-700/50 mt-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className="p-2 bg-gray-700 rounded-lg text-gray-300">
                                                            <EyeOff size={20} />
                                                        </div>
                                                        <div>
                                                            <h4 className="text-sm font-medium text-white">Censor Thumbnails (Privacy Mode)</h4>
                                                            <p className="text-xs text-gray-500">Blur all images in the grid. Useful for privacy.</p>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleSetCensor(!censorThumbnails)}
                                                        className={clsx(
                                                            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                                                            censorThumbnails ? "bg-blue-600" : "bg-gray-700"
                                                        )}
                                                    >
                                                        <span className={clsx(
                                                            "inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200",
                                                            censorThumbnails ? "translate-x-6" : "translate-x-1"
                                                        )} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* KEYBINDS TAB */}
                                {activeTab === 'keybinds' && (
                                    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                                        <div>
                                            <h4 className="text-lg font-medium text-white mb-1">Keyboard Shortcuts</h4>
                                            <p className="text-sm text-gray-500 mb-4">Manage application hotkeys.</p>

                                            <div className="space-y-2">
                                                <div className="bg-gray-700/30 rounded-xl p-4 border border-gray-700/50 flex items-center justify-between">
                                                    <div>
                                                        <h5 className="text-sm font-medium text-white">Toggle Privacy Mode</h5>
                                                        <p className="text-xs text-gray-500">Instantly blur/unblur thumbnails.</p>
                                                    </div>
                                                    <KeybindButton
                                                        currentKey={keybinds['togglePrivacy'] || 'V'}
                                                        onUpdate={(k) => onUpdateKeybind('togglePrivacy', k)}
                                                    />
                                                </div>
                                                {/* Future bindings can go here */}
                                                <div className="text-center p-4">
                                                    <p className="text-xs text-gray-600 italic">More keybindings coming in future updates.</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'network' && (
                                    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                                        <div>
                                            <div className="flex items-center justify-between mb-4">
                                                <div>
                                                    <h4 className="text-lg font-medium text-white">HTTP Server</h4>
                                                    <p className="text-sm text-gray-500">Allow local network access to your library.</p>
                                                </div>
                                                <button
                                                    onClick={onToggleServer}
                                                    className={clsx(
                                                        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                                                        serverEnabled ? "bg-green-500" : "bg-gray-700"
                                                    )}
                                                >
                                                    <span className={clsx(
                                                        "inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200",
                                                        serverEnabled ? "translate-x-6" : "translate-x-1"
                                                    )} />
                                                </button>
                                            </div>

                                            <div className="bg-black/30 rounded-xl p-4 border border-gray-700/50 space-y-4">
                                                <div className="flex items-center gap-4">
                                                    <div className="flex-1 space-y-1">
                                                        <label className="text-xs uppercase font-bold text-gray-500">Local IP Address</label>
                                                        <div className="flex items-center gap-2">
                                                            <div className="font-mono text-blue-400">{localIP}</div>
                                                            {serverEnabled && !isWeb && (
                                                                <button
                                                                    onClick={() => {
                                                                        // @ts-ignore
                                                                        window.runtime.BrowserOpenURL(`http://${localIP}:${serverPort}`);
                                                                    }}
                                                                    className="p-1 text-gray-400 hover:text-white transition-colors"
                                                                    title="Open in Browser"
                                                                >
                                                                    <ExternalLink size={14} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="w-px h-8 bg-gray-700"></div>
                                                    <div className="flex-1 space-y-1">
                                                        <label className="text-xs uppercase font-bold text-gray-500">Port</label>
                                                        <input
                                                            type="text"
                                                            value={serverPort}
                                                            onChange={(e) => setServerPort(e.target.value)}
                                                            disabled={serverEnabled}
                                                            className={clsx(
                                                                "bg-transparent font-mono text-white w-full outline-none focus:border-b border-blue-500",
                                                                serverEnabled && "opacity-50 cursor-not-allowed"
                                                            )}
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="mt-6">
                                                <div className="flex items-center justify-between mb-2">
                                                    <label className="text-xs uppercase font-bold text-gray-500 flex items-center gap-2">
                                                        <Terminal size={14} /> Server Console
                                                    </label>
                                                    <button onClick={() => setLogs([])} className="text-xs text-gray-400 hover:text-white">Clear</button>
                                                </div>
                                                <div className="bg-black rounded-lg border border-gray-800 p-3 h-32 overflow-y-auto font-mono text-xs text-gray-400 custom-scrollbar">
                                                    {logs.length === 0 && <div className="text-gray-600 italic">Ready to start...</div>}
                                                    {logs.map((log, i) => (
                                                        <div key={i}>{log}</div>
                                                    ))}
                                                    <div ref={logEndRef} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'storage' && (
                                    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                                        <div>
                                            <h4 className="text-lg font-medium text-white mb-1">Storage Management</h4>
                                            <p className="text-sm text-gray-500 mb-4">Manage local data, caches, and configuration.</p>

                                            <div className="flex flex-col gap-3">
                                                <button
                                                    onClick={() => {
                                                        // @ts-ignore
                                                        if (window.go) window.go.main.App.OpenAppDataFolder();
                                                    }}
                                                    className="flex items-center justify-between p-4 bg-gray-700/30 hover:bg-gray-700/50 border border-gray-700 rounded-xl transition-all group"
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg group-hover:bg-blue-500/20 transition-colors">
                                                            <FolderOpen size={20} />
                                                        </div>
                                                        <div className="text-left">
                                                            <h5 className="text-sm font-medium text-gray-200">Open App Data Folder</h5>
                                                            <p className="text-xs text-gray-500">Access logs and config files.</p>
                                                        </div>
                                                    </div>
                                                    <ExternalLink size={16} className="text-gray-500 group-hover:text-white transition-colors" />
                                                </button>

                                                <button
                                                    onClick={handleClearData}
                                                    className="flex items-center justify-between p-4 bg-red-500/5 hover:bg-red-500/10 border border-red-500/20 rounded-xl transition-all group"
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <div className="p-2 bg-red-500/10 text-red-400 rounded-lg group-hover:bg-red-500/20 transition-colors">
                                                            <Trash2 size={20} />
                                                        </div>
                                                        <div className="text-left">
                                                            <h5 className="text-sm font-medium text-gray-200">Reset Application</h5>
                                                            <p className="text-xs text-gray-500">Clear all data and restart YAVAM.</p>
                                                        </div>
                                                    </div>
                                                    <AlertTriangle size={16} className="text-red-500/50 group-hover:text-red-400 transition-colors" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'about' && (
                                    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                                        <div className="flex flex-col items-center justify-center pt-8 h-full">
                                            {/* Horizontal Card */}
                                            <div className="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-8 flex items-center gap-8 shadow-2xl max-w-xl w-full">
                                                {/* Logo */}
                                                <div className="w-32 h-32 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-blue-900/30">
                                                    <span className="text-6xl font-bold text-white select-none">Y</span>
                                                </div>

                                                {/* Info */}
                                                <div className="flex-1 text-left space-y-4">
                                                    <div>
                                                        <h2 className="text-4xl font-bold text-white tracking-tight">YAVAM</h2>
                                                        <p className="text-gray-400 text-sm mt-1">Yet Another VaM Addon Manager</p>
                                                    </div>

                                                    <div className="flex items-center gap-3 pt-2">
                                                        <span className="px-2.5 py-1 bg-gray-700/50 rounded-md text-xs font-mono text-gray-300 border border-gray-600/50">
                                                            {appVersion}
                                                        </span>
                                                        <div className="h-4 w-px bg-gray-700"></div>
                                                        <button
                                                            onClick={() => {
                                                                // @ts-ignore
                                                                if (window.runtime) window.runtime.BrowserOpenURL("https://github.com/fivelsystems/yavam");
                                                                else window.open("https://github.com/fivelsystems/yavam", "_blank");
                                                            }}
                                                            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-xs font-medium uppercase tracking-wide group"
                                                        >
                                                            <Github size={14} className="group-hover:text-blue-400 transition-colors" />
                                                            <span>Repository</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="mt-12 text-center space-y-1">
                                                <p className="text-gray-500 text-sm">Designed & Developed by <span className="text-gray-300 font-medium">FivelSystems</span></p>
                                                <p className="text-[10px] text-gray-600 uppercase tracking-widest">Copyright © 2026</p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-4 bg-gray-900/50 border-t border-gray-700 flex justify-end items-center shrink-0 gap-3">
                            <button
                                onClick={handleCancel}
                                className="px-4 py-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg font-medium transition-colors text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleApply}
                                disabled={!hasChanges}
                                className={clsx(
                                    "px-4 py-2 rounded-lg font-medium transition-colors text-sm flex items-center gap-2",
                                    hasChanges
                                        ? "bg-gray-700 hover:bg-gray-600 text-white"
                                        : "bg-gray-800 text-gray-500 cursor-not-allowed"
                                )}
                            >
                                <Check size={16} />
                                Apply
                            </button>
                            <button
                                onClick={handleSaveAndClose}
                                className={clsx(
                                    "px-4 py-2 rounded-lg font-medium transition-colors text-sm flex items-center gap-2",
                                    hasChanges
                                        ? "bg-blue-600 hover:bg-blue-500 text-white"
                                        : "bg-blue-600/50 hover:bg-blue-600/60 text-white/50" // Still allow saving (essentially just Close) but subtle? Or always active?
                                    // Standard behavior: Save & Close is always active (acts as OK), or disabled if invalid.
                                    // The user said "Save and close just closes the modal after saving". This implies it saves current buffer.
                                    // If no changes, it just closes. 
                                )}
                            >
                                <Save size={16} />
                                Save & Close
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default SettingsModal;
