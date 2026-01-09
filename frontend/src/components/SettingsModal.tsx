import { useState, useEffect, useRef } from 'react';
import { X, LayoutGrid, Network, Terminal, AlertTriangle, ExternalLink, HardDrive } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from 'clsx';


interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    // General Tab
    gridSize: number;
    setGridSize: (size: number) => void;
    itemsPerPage: number;
    setItemsPerPage: (val: number) => void;
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
    serverEnabled,
    onToggleServer,
    serverPort,
    setServerPort,
    localIP,
    logs,
    setLogs,
    isWeb,

}: SettingsModalProps) => {

    const [activeTab, setActiveTab] = useState<'general' | 'network' | 'storage'>('general');
    const [minimizeOnClose, setMinimizeOnClose] = useState(() => localStorage.getItem('minimizeOnClose') === 'true');
    const [appVersion, setAppVersion] = useState("");

    useEffect(() => {
        // @ts-ignore
        if (window.go && window.go.main && window.go.main.App) {
            // @ts-ignore
            window.go.main.App.GetAppVersion().then(v => setAppVersion("v" + v));
        } else {
            setAppVersion("v1.1.3-e (Web)");
        }
    }, []);

    const logEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (logEndRef.current) logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }, [logs]);

    const tabs = [
        { id: 'general', label: 'General', icon: LayoutGrid },
        // Conditional Tabs
        ...(!isWeb ? [
            { id: 'network', label: 'Network', icon: Network },
            { id: 'storage', label: 'Storage', icon: HardDrive },
        ] : [])
    ] as const;

    const handleClearData = async () => {
        if (!confirm("Are you sure you want to clear ALL data? This will reset all settings, thumbnails, and application state.\n\nThe application will close immediately.")) return;

        // Clear LocalStorage
        localStorage.clear();

        // Clear Backend Data
        try {
            // @ts-ignore
            if (window.go) await window.go.main.App.ClearAppData();
        } catch (e) {
            console.error("Failed to clear app data", e);
        }

        // Quit
        // @ts-ignore
        if (window.runtime) window.runtime.Quit();
        else window.location.reload();
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
                            <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors">
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
                                {activeTab === 'general' && (
                                    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                                        <div>
                                            <h4 className="text-lg font-medium text-white mb-1">Appearance & preferences</h4>
                                            <p className="text-sm text-gray-500 mb-4">Customize how YAVAM looks and feels.</p>

                                            <div className="space-y-4">
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
                                                    {itemsPerPage > 50 && (
                                                        <div className="mt-2 flex items-center gap-2 text-yellow-500 text-xs bg-yellow-500/10 p-2 rounded">
                                                            <AlertTriangle size={14} />
                                                            <span>High count may impact performance. Recommended max: 50.</span>
                                                        </div>
                                                    )}
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
                                                            {isWeb && (
                                                                <button
                                                                    onClick={() => {
                                                                        fetch('/api/restore', { method: 'POST' })
                                                                            .then(() => alert("Host window restored!"))
                                                                            .catch(err => alert("Failed to restore: " + err));
                                                                    }}
                                                                    className="px-2 py-0.5 bg-blue-600/20 text-blue-400 text-xs rounded border border-blue-600/30 hover:bg-blue-600/30 transition-colors"
                                                                >
                                                                    Show Host Window
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

                                            {!isWeb && (
                                                <div className="flex items-center justify-between pt-4 border-t border-gray-700">
                                                    <div>
                                                        <h4 className="text-sm font-medium text-white">Run in Background</h4>
                                                        <p className="text-xs text-gray-500">Hide window on close but keep server running. Restore via Web UI.</p>
                                                    </div>
                                                    {/* Minimize Logic here or separate? Keep local state for minimize pref */}
                                                    <button
                                                        onClick={() => {
                                                            const newVal = !minimizeOnClose;
                                                            setMinimizeOnClose(newVal);
                                                            localStorage.setItem('minimizeOnClose', newVal.toString());
                                                            // @ts-ignore
                                                            if (window.go) window.go.main.App.SetMinimizeOnClose(newVal);
                                                        }}
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
                                            )}
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'storage' && (
                                    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                                        <div>
                                            <h4 className="text-lg font-medium text-white mb-1">Storage Management</h4>
                                            <p className="text-sm text-gray-500 mb-4">Manage local data, caches, and configuration.</p>

                                            <div className="space-y-4">
                                                <div className="bg-black/30 rounded-xl p-4 border border-gray-700/50 flex items-center justify-between">
                                                    <div>
                                                        <h5 className="text-sm font-medium text-gray-200">Local App Folder</h5>
                                                        <p className="text-xs text-gray-500">Contains logs, thumbnails, and temporary files in your user profile.</p>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => {
                                                                // @ts-ignore
                                                                if (window.go) window.go.main.App.OpenAppDataFolder();
                                                            }}
                                                            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded-lg transition-colors border border-gray-600"
                                                        >
                                                            Open Location
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="bg-red-500/10 rounded-xl p-4 border border-red-500/20">
                                                    <h5 className="text-sm font-medium text-red-400 mb-2">Danger Zone</h5>
                                                    <div className="flex items-center justify-between">
                                                        <p className="text-xs text-red-300/70 max-w-[70%] leading-relaxed">
                                                            Clearing data will reset all settings, cached thumbnails, and application state. A restart is required immediately after cleaning.
                                                        </p>
                                                        <button
                                                            onClick={handleClearData}
                                                            className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg transition-colors shadow-lg shadow-red-900/20"
                                                        >
                                                            Clear All Data & Restart
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-4 bg-gray-900/50 border-t border-gray-700 flex justify-between items-center shrink-0">
                            <span className="text-xs text-gray-500 font-mono">{appVersion}</span>
                            <button
                                onClick={onClose}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors"
                            >
                                Done
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default SettingsModal;
