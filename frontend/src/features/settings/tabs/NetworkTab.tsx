import { useState, useEffect } from 'react';
import { Network, AlertTriangle, ExternalLink } from 'lucide-react';
import clsx from 'clsx';
import Console from '../../../components/ui/Console';

interface NetworkTabProps {
    serverEnabled: boolean;
    onToggleServer: () => void;
    serverPort: string;
    setServerPort: (port: string) => void;
    publicAccess: boolean;
    onTogglePublicAccess: () => void;
    localIP: string;
    logs: string[];
    setLogs: React.Dispatch<React.SetStateAction<string[]>>;
    isWeb: boolean;
}

const NetworkTab = ({
    serverEnabled,
    onToggleServer,
    serverPort,
    setServerPort,
    publicAccess,
    onTogglePublicAccess,
    localIP,
    logs,
    setLogs,
    isWeb
}: NetworkTabProps) => {

    // Session State (Local to this tab as it polls)
    const [sessions, setSessions] = useState<any[]>([]);

    const fetchSessions = async () => {
        // @ts-ignore
        if (window.go && window.go.main && window.go.main.App) {
            // @ts-ignore
            const list = await window.go.main.App.ListSessions();
            setSessions(list || []);
        }
    };

    const handleRevokeSession = async (id: string) => {
        if (!confirm("Are you sure you want to disconnect this device?")) return;
        try {
            // @ts-ignore
            await window.go.main.App.RevokeSession(id);
            fetchSessions();
        } catch (e) {
            console.error("Failed to revoke session", e);
        }
    };

    useEffect(() => {
        if (!isWeb) {
            fetchSessions();
            const interval = setInterval(fetchSessions, 5000);
            return () => clearInterval(interval);
        }
    }, [isWeb]);

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
                <h4 className="text-lg font-medium text-white mb-1">Network & Server</h4>
                <p className="text-sm text-gray-500 mb-4">Manage remote access and connectivity.</p>

                <div className="space-y-6">
                    {/* Server Toggle */}
                    <div className="bg-gray-700/20 rounded-xl p-4 border border-gray-700/50 flex items-center justify-between">
                        <div>
                            <h4 className="text-sm font-medium text-white">HTTP Server</h4>
                            <p className="text-xs text-gray-500">Enable local network access to your library.</p>
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

                    {/* Connection Info */}
                    <div className="bg-black/30 rounded-xl p-4 border border-gray-700/50 space-y-4">
                        <div className="flex items-center gap-4">
                            <div className="flex-1 space-y-1">
                                <label className="text-xs uppercase font-bold text-gray-500">Local IP Address</label>
                                <div className="flex items-center gap-2">
                                    <div className="font-mono text-blue-400 font-medium">{localIP}</div>
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
                                        "bg-transparent font-mono text-white w-full outline-none focus:border-b border-blue-500 transition-colors",
                                        serverEnabled && "opacity-50 cursor-not-allowed"
                                    )}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Public Access */}
                    {serverEnabled && (
                        <div className="bg-gray-700/20 border border-gray-700/50 rounded-xl p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="text-sm font-medium text-white flex items-center gap-2">
                                        Public Access
                                        {publicAccess && <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded border border-red-500/30 uppercase font-bold">Insecure</span>}
                                    </h4>
                                    <p className="text-xs text-gray-500">Allow unauthenticated guests to view your library (Read Only).</p>
                                </div>
                                <button
                                    onClick={onTogglePublicAccess}
                                    className={clsx(
                                        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                                        publicAccess ? "bg-red-500" : "bg-gray-700"
                                    )}
                                >
                                    <span className={clsx(
                                        "inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200",
                                        publicAccess ? "translate-x-6" : "translate-x-1"
                                    )} />
                                </button>
                            </div>
                            {publicAccess && (
                                <div className="mt-3 text-xs bg-red-900/20 border border-red-900/30 text-red-300 p-2 rounded flex items-start gap-2">
                                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                                    <p>ANYONE on your local network (Wi-Fi) can view your library without a password. Sensitive actions are still protected.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Console */}
                    <div className="mt-6">
                        <Console logs={logs} onClear={() => setLogs([])} maxHeight="h-32" />
                    </div>

                    {/* Active Sessions */}
                    {!isWeb && (
                        <div className="mt-6 border-t border-gray-700 pt-6">
                            <h4 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                                Active Devices ({sessions.length})
                            </h4>
                            <div className="space-y-2">
                                {sessions.length === 0 ? (
                                    <p className="text-xs text-gray-500 italic">No active sessions.</p>
                                ) : (
                                    sessions.map((session) => (
                                        <div key={session.id} className="bg-gray-800 border border-gray-700 rounded-lg p-3 flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center">
                                                    <Network size={16} />
                                                </div>
                                                <div>
                                                    <div className="text-sm text-gray-200 font-medium">{session.deviceName || "Unknown Device"}</div>
                                                    <div className="text-xs text-gray-500">
                                                        Connected: {new Date(session.createdAt).toLocaleString()}
                                                    </div>
                                                </div>
                                            </div>

                                            {session.deviceName !== "Local System" ? (
                                                <button
                                                    onClick={() => handleRevokeSession(session.id)}
                                                    className="text-xs text-red-400 hover:text-red-300 hover:bg-red-900/20 px-2 py-1 rounded transition-colors"
                                                >
                                                    Disconnect
                                                </button>
                                            ) : (
                                                <span className="text-xs text-gray-600 italic px-2">Current</span>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default NetworkTab;
