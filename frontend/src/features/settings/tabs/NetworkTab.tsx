import { useState, useEffect } from 'react';
import { Network, AlertTriangle, ExternalLink, Play, Square } from 'lucide-react';
import clsx from 'clsx';
import Console from '../../../components/ui/Console';
// Generic Components
import { SettingGroup } from '../components/SettingGroup';
import { SettingItem } from '../components/SettingItem';
import { Toggle } from '../../../components/ui/Toggle';
import { Input } from '../../../components/ui/Input';
import { motion } from 'framer-motion';

const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.05
        }
    }
};

const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0 }
};

interface NetworkTabProps {
    serverEnabled: boolean;
    onToggleServer: () => void;
    serverPort: string;
    setServerPort: (port: string) => void;
    onStartServer: () => void;
    onStopServer: () => void;
    publicAccess: boolean;
    onTogglePublicAccess: () => void;
    localIP: string;
    logs: string[];
    setLogs: React.Dispatch<React.SetStateAction<string[]>>;
    isWeb: boolean;
    authPollInterval: number;
    setAuthPollInterval: (val: number) => void;
}

const NetworkTab = ({
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
    isWeb,
    authPollInterval,
    setAuthPollInterval
}: NetworkTabProps) => {

    // Session State (Local to this tab as it polls)
    const [sessions, setSessions] = useState<any[]>([]);
    const [isRunning, setIsRunning] = useState(false);

    const fetchData = async () => {
        // @ts-ignore
        if (window.go && window.go.main && window.go.main.App) {
            // @ts-ignore
            const list = await window.go.main.App.ListSessions();
            setSessions(list || []);

            // @ts-ignore
            const running = await window.go.main.App.IsServerRunning();
            setIsRunning(running);
        }
    };

    const handleRevokeSession = async (id: string) => {
        if (!confirm("Are you sure you want to disconnect this device?")) return;
        try {
            // @ts-ignore
            await window.go.main.App.RevokeSession(id);
            fetchData();
        } catch (e) {
            console.error("Failed to revoke session", e);
        }
    };

    const handleStart = async () => {
        onStartServer();
        // Optimistic / Poll will catch up
        setTimeout(fetchData, 500);
    }

    const handleStop = async () => {
        onStopServer();
        setTimeout(fetchData, 500);
    }

    useEffect(() => {
        if (!isWeb) {
            fetchData();
            const interval = setInterval(fetchData, 2000); // Faster poll for responsiveness
            return () => clearInterval(interval);
        }
    }, [isWeb]);

    return (
        <motion.div
            className="space-y-6"
            variants={container}
            initial="hidden"
            animate="show"
        >
            <div>
                <h4 className="text-lg font-medium text-white mb-1">Network & Server</h4>
                <p className="text-sm text-gray-500 mb-6">Manage remote access and connectivity.</p>

                <div className="space-y-6">
                    {/* Manual Control (Start/Stop) - Custom Group */}
                    <motion.div
                        variants={item}
                        className="bg-gray-800 rounded-xl p-4 border border-gray-700 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 md:gap-0"
                    >
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <h4 className="text-sm font-medium text-white">Server Status</h4>
                                <div className={clsx(
                                    "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                                    isRunning ? "bg-green-500/20 text-green-400 border border-green-500/30" : "bg-gray-700 text-gray-400"
                                )}>
                                    {isRunning ? "Running" : "Stopped"}
                                </div>
                            </div>
                            <p className="text-xs text-gray-500">Manually start or stop the web server.</p>
                        </div>
                        <div className="flex gap-2">
                            {!isRunning ? (
                                <button
                                    onClick={handleStart}
                                    className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-xs font-bold uppercase transition-colors flex items-center gap-2"
                                >
                                    <Play size={14} fill="currentColor" /> Start Server
                                </button>
                            ) : (
                                <button
                                    onClick={handleStop}
                                    className="px-4 py-2 bg-red-900/40 hover:bg-red-900/60 border border-red-900 text-red-100 rounded-lg text-xs font-bold uppercase transition-colors flex items-center gap-2"
                                >
                                    <Square size={14} fill="currentColor" /> Stop Server
                                </button>
                            )}
                        </div>
                    </motion.div>

                    {/* Configuration Group */}
                    <SettingGroup title="Configuration" tooltip="Server startup and port settings." variants={item}>
                        <SettingItem
                            title="Run on Startup"
                            tooltip="Automatically start server when app launches."
                        >
                            <Toggle checked={serverEnabled} onChange={onToggleServer} size="md" />
                        </SettingItem>

                        <SettingItem
                            title="Server Port"
                            tooltip="Port to listen on (Default: 18888)."
                        >
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500 font-mono">TCP</span>
                                <Input
                                    value={serverPort}
                                    onChange={(e) => setServerPort(e.target.value)}
                                    disabled={isRunning}
                                    className="w-24 text-center font-mono"
                                />
                            </div>
                        </SettingItem>
                        {isRunning && (
                            <p className="text-[10px] text-orange-400 italic text-right pr-2">
                                Stop server to change port.
                            </p>
                        )}

                        <SettingItem
                            title="Auth Polling Interval"
                            tooltip="Frequency of session revocation checks (Seconds)."
                        >
                            <Input
                                type="number"
                                min={1}
                                max={60}
                                value={authPollInterval}
                                onChange={(e) => setAuthPollInterval(parseInt(e.target.value) || 2)}
                                rightLabel="Sec"
                                className="w-24 text-center font-mono"
                            />
                        </SettingItem>
                    </SettingGroup>

                    {/* Connection Info */}
                    <SettingGroup variants={item}>
                        <div className="flex items-center gap-4">
                            <div className="flex-1 space-y-1">
                                <label className="text-xs uppercase font-bold text-gray-500">Local Address</label>
                                <div className="flex items-center gap-2">
                                    <div className="font-mono text-blue-400 font-medium select-all">http://{localIP}:{serverPort}</div>
                                    {isRunning && !isWeb && (
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
                        </div>
                    </SettingGroup>

                    {/* Public Access */}
                    {serverEnabled && (
                        <SettingGroup
                            title={
                                <span className="flex items-center gap-2">
                                    Public Access
                                    {publicAccess && <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded border border-red-500/30 uppercase font-bold">Insecure</span>}
                                </span>
                            }
                            tooltip="Allow unauthenticated guests to view your library (Read Only)."
                            variant={publicAccess ? "danger" : "default"}
                            variants={item}
                            action={
                                <Toggle
                                    checked={publicAccess}
                                    onChange={onTogglePublicAccess}
                                    variant="danger" // Use Danger Red for risky toggle
                                />
                            }
                        >
                            {publicAccess && (
                                <div className="text-xs bg-red-900/20 border border-red-900/30 text-red-300 p-2 rounded flex items-start gap-2">
                                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                                    <p>ANYONE on your local network (Wi-Fi) can view your library without a password. Sensitive actions are still protected.</p>
                                </div>
                            )}
                        </SettingGroup>
                    )}

                    {/* Console */}
                    <SettingGroup title="Server Logs" className="bg-black/30" variants={item}>
                        <Console logs={logs} onClear={() => setLogs([])} maxHeight="h-32" />
                    </SettingGroup>

                    {/* Active Sessions */}
                    {!isWeb && (
                        <motion.div variants={item} className="mt-6 border-t border-gray-700 pt-6">
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
                        </motion.div>
                    )}
                </div>
            </div>
        </motion.div>
    );
};

export default NetworkTab;
