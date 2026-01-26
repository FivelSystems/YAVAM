import { useState, useEffect } from 'react';
import { config } from '../wailsjs/go/models';

// Common toast type for callback
type ToastType = 'success' | 'error' | 'info' | 'warning';

export const useServer = () => {
    // -- State --
    const [serverEnabled, setServerEnabled] = useState(false);
    const [serverPort, setServerPort] = useState("18888");
    const [localIP, setLocalIP] = useState("Loading...");
    const [serverLogs, setServerLogs] = useState<string[]>([]);
    const [isTogglingServer, setIsTogglingServer] = useState(false);

    const [publicAccess, setPublicAccess] = useState(false);
    const [authPollInterval, setAuthPollInterval] = useState(() => parseInt(localStorage.getItem('authPollInterval') || '15'));

    // -- Initialization --
    useEffect(() => {
        // @ts-ignore
        if (window.go && window.go.main && window.go.main.App) {
            // @ts-ignore
            window.go.main.App.GetConfig().then((cfg: config.Config) => {
                if (cfg) {
                    setServerEnabled(cfg.serverEnabled);
                    setServerPort(cfg.serverPort);
                    setPublicAccess(cfg.publicAccess);
                    setAuthPollInterval(cfg.authPollInterval);
                    // LocalIP is usually fetched separately via GetLocalIP but context initialized it to "Loading..."
                    // Let's grab IP too if possible or separate call? 
                    // Dashboard used to call GetLocalIP() separately. Let's add that too.
                    // @ts-ignore
                    window.go.main.App.GetLocalIP().then((ip: string) => setLocalIP(ip));
                }
            }).catch((err: any) => console.error("Failed to load server config:", err));
        }
    }, []);

    // -- Actions --

    const toggleServer = async (addToast: (msg: string, type: ToastType) => void) => {
        if (isTogglingServer) return;
        setIsTogglingServer(true);
        // @ts-ignore
        if (window.go && window.go.main && window.go.main.App) {
            try {
                // @ts-ignore
                await window.go.main.App.SetServerEnabled(!serverEnabled);
                // Optimistic UI update
                setServerEnabled(!serverEnabled);
            } catch (e) {
                console.error(e);
                addToast("Failed to toggle server: " + e, 'error');
            } finally {
                setIsTogglingServer(false);
            }
        }
    };

    const togglePublicAccess = async (addToast: (msg: string, type: ToastType) => void) => {
        const newState = !publicAccess;
        try {
            // @ts-ignore
            if (window.go && window.go.main && window.go.main.App) {
                // @ts-ignore
                await window.go.main.App.SetPublicAccess(newState);
            } else {
                await fetch('/api/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ publicAccess: newState })
                });
            }
            setPublicAccess(newState);
            addToast(`Public Access ${newState ? 'Enabled' : 'Disabled'}`, newState ? 'warning' : 'success');
        } catch (e) {
            console.error("Failed to toggle public access:", e);
            addToast("Failed to update setting", 'error');
        }
    };

    const updateAuthPollInterval = async (val: number, addToast: (msg: string, type: ToastType) => void) => {
        try {
            // @ts-ignore
            if (window.go && window.go.main && window.go.main.App) {
                // @ts-ignore
                await window.go.main.App.SetAuthPollInterval(val);
            } else {
                await fetch('/api/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ authPollInterval: val })
                });
            }
            setAuthPollInterval(val);
            localStorage.setItem('authPollInterval', val.toString());
        } catch (e) {
            console.error("Failed to set auth poll interval:", e);
            addToast("Failed to update setting", 'error');
        }
    };

    return {
        // State
        serverEnabled, setServerEnabled,
        serverPort, setServerPort,
        localIP, setLocalIP,
        serverLogs, setServerLogs,
        isTogglingServer, setIsTogglingServer,
        publicAccess, setPublicAccess,
        authPollInterval, setAuthPollInterval,

        // Actions
        toggleServer,
        togglePublicAccess,
        updateAuthPollInterval
    };
};
