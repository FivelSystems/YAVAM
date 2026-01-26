import { useState, useEffect } from 'react';
// @ts-ignore
import { EventsOn } from '../wailsjs/runtime/runtime';

/**
 * useSuspendMode listens for Backend signals to maximize/minimize memory usage.
 * When suspended (Tray Minimize), it returns true so the App can unmount the UI.
 */
export const useSuspendMode = () => {
    const [isSuspended, setIsSuspended] = useState(false);

    useEffect(() => {
        // Only run in Desktop Environment
        if (!window.go) return;

        console.log("[useSuspendMode] Initializing listeners...");

        const cleanupSuspend = EventsOn("window:suspend", () => {
            console.log("[App] Suspending UI to save memory...");
            setIsSuspended(true);
        });

        const cleanupRestore = EventsOn("window:restore", () => {
            console.log("[App] Restoring UI...");
            setIsSuspended(false);
        });

        return () => {
            if (cleanupSuspend) cleanupSuspend();
            if (cleanupRestore) cleanupRestore();
        };
    }, []);

    return isSuspended;
};
