import { useState, useEffect, useCallback, useRef } from 'react';
import { config } from '../wailsjs/go/models';
import { fetchWithAuth } from '../services/api';
import { resolveActiveLibrary, rememberActiveLibrary } from './activeLibrary';

const ADD_LIBRARY_FAILED_MESSAGE = "Couldn't add that folder. Check that it exists and that you can read it.";

interface HostConfig {
    setupDone: boolean;
    libraries?: string[] | null;
}

interface UseLibraryOptions {
    notifyError?: (message: string) => void;
}

const hasDesktopBridge = (): boolean =>
    // @ts-ignore
    Boolean(window.go && window.go.main && window.go.main.App);

const fetchHostConfig = async (): Promise<HostConfig> => {
    if (hasDesktopBridge()) {
        // @ts-ignore
        const cfg: config.Config | null = await window.go.main.App.GetConfig();
        if (!cfg) throw new Error("The host returned no configuration");
        return cfg;
    }
    const response = await fetchWithAuth('/api/config');
    if (!response.ok) throw new Error("Failed to fetch config");
    const data: HostConfig | null = await response.json();
    if (!data) throw new Error("The host returned no configuration");
    return data;
};

export const useLibrary = ({ notifyError }: UseLibraryOptions = {}) => {
    // -- State --
    const [libraries, setLibraries] = useState<string[]>([]);
    const [rememberedPath, setRememberedPath] = useState<string>(() => {
        const current = localStorage.getItem("activeLibraryPath");
        if (current) return current;
        const saved = localStorage.getItem("savedLibraries");
        const libs = saved ? JSON.parse(saved) : [];
        return libs.length > 0 ? libs[0] : "";
    });
    const [activeLibIndex, setActiveLibIndex] = useState(0);
    const [needsSetup, setNeedsSetup] = useState(false);
    const [hostLibrariesLoaded, setHostLibrariesLoaded] = useState(false);
    const [libraryLoadFailed, setLibraryLoadFailed] = useState(false);

    // Ref for stale closure access
    const activeLibIndexRef = useRef(activeLibIndex);
    useEffect(() => {
        activeLibIndexRef.current = activeLibIndex;
    }, [activeLibIndex]);

    const rememberedPathRef = useRef(rememberedPath);
    useEffect(() => {
        rememberedPathRef.current = rememberedPath;
    }, [rememberedPath]);

    const addInProgressRef = useRef(false);

    // The path the app works on. A path remembered by this client is not used
    // until the host has said which libraries exist: the host decides.
    const activeLibraryPath = hostLibrariesLoaded ? rememberedPath : "";

    // -- Helpers --

    const selectLibrary = useCallback((pathOrIndex: string | number) => {
        let path = "";
        let index = -1;

        if (typeof pathOrIndex === 'number') {
            index = pathOrIndex;
            if (index >= 0 && index < libraries.length) {
                path = libraries[index];
            }
        } else {
            path = pathOrIndex;
            index = libraries.indexOf(path);
        }

        if (path && index !== -1) {
            setActiveLibIndex(index);
            setRememberedPath(path);
            localStorage.setItem("activeLibraryPath", path);
        }
    }, [libraries]);

    const addLibrary = useCallback(async (path: string) => {
        if (!path || !hasDesktopBridge() || addInProgressRef.current) return;

        if (libraries.includes(path)) {
            selectLibrary(path);
            return;
        }

        // The host refuses to scan a folder that is not a configured library,
        // so it has to know the library before it becomes the active one.
        addInProgressRef.current = true;
        try {
            // @ts-ignore
            await window.go.main.App.AddConfiguredLibrary(path);
        } catch (err) {
            console.error("Failed to add library:", err);
            notifyError?.(ADD_LIBRARY_FAILED_MESSAGE);
            return;
        } finally {
            addInProgressRef.current = false;
        }

        const newLibs = [...libraries, path];
        const active = { path, index: newLibs.length - 1 };
        setLibraries(newLibs);
        setRememberedPath(active.path);
        setActiveLibIndex(active.index);
        rememberActiveLibrary(newLibs, active);
    }, [libraries, selectLibrary, notifyError]);

    const removeLibrary = useCallback((path: string) => {
        setLibraries(prev => {
            const index = prev.indexOf(path);
            if (index === -1) return prev;

            const newLibs = [...prev];
            newLibs.splice(index, 1);
            localStorage.setItem("savedLibraries", JSON.stringify(newLibs));

            // Adjust selection
            if (activeLibIndex >= newLibs.length) {
                const newIdx = Math.max(0, newLibs.length - 1);
                setActiveLibIndex(newIdx);
                const newPath = newLibs[newIdx] || "";
                setRememberedPath(newPath);
                localStorage.setItem("activeLibraryPath", newPath);
            } else if (index === activeLibIndex) {
                // Removed currently active?
                const newPath = newLibs[activeLibIndex] || (newLibs.length > 0 ? newLibs[0] : "");
                setRememberedPath(newPath);
                if (newPath) localStorage.setItem("activeLibraryPath", newPath);
            } else if (index < activeLibIndex) {
                setActiveLibIndex(prevIdx => prevIdx - 1);
            }

            // Sync Backend
            // @ts-ignore
            if (window.go && window.go.main && window.go.main.App) {
                // @ts-ignore
                window.go.main.App.RemoveConfiguredLibrary(path);
            }

            return newLibs;
        });
    }, [activeLibIndex]);

    const reorderLibraries = useCallback((newOrder: string[]) => {
        setLibraries(newOrder);
        // @ts-ignore
        if (window.go && window.go.main && window.go.main.App) {
            // @ts-ignore
            window.go.main.App.ReorderConfiguredLibraries(newOrder);
        }

        // Sync index
        const newIdx = newOrder.indexOf(rememberedPath);
        if (newIdx !== -1) {
            setActiveLibIndex(newIdx);
        }
    }, [rememberedPath]);

    // Desktop: Browse
    const browseAndAdd = useCallback(async () => {
        // @ts-ignore
        if (window.go) {
            try {
                // @ts-ignore
                const p = await window.go.main.App.SelectDirectory();
                if (p) await addLibrary(p);
            } catch (e) {
                console.error(e);
            }
        }
    }, [addLibrary]);

    const applyHostLibraries = useCallback((hostLibraries: string[]) => {
        const active = resolveActiveLibrary(hostLibraries, rememberedPathRef.current);
        setLibraries(hostLibraries);
        setRememberedPath(active.path);
        setActiveLibIndex(active.index);
        rememberActiveLibrary(hostLibraries, active);
        setHostLibrariesLoaded(true);
    }, []);

    const loadHostLibraries = useCallback(async () => {
        setLibraryLoadFailed(false);
        try {
            const hostConfig = await fetchHostConfig();
            // The setup wizard is desktop-only: FinishSetup() can only be called via Wails.
            setNeedsSetup(!hostConfig.setupDone);
            applyHostLibraries(hostConfig.libraries ?? []);
        } catch (err) {
            console.error("Failed to load the library list from the host:", err);
            setLibraryLoadFailed(true);
        }
    }, [applyHostLibraries]);

    useEffect(() => {
        void loadHostLibraries();
    }, [loadHostLibraries]);

    // Also: Sync Active Index when libraries list changes (Refactored from Dashboard)
    useEffect(() => {
        if (rememberedPath && libraries.length > 0) {
            const idx = libraries.findIndex(l => l.toLowerCase() === rememberedPath.toLowerCase());
            if (idx !== -1 && idx !== activeLibIndex) {
                setActiveLibIndex(idx);
            }
        }
    }, [libraries, rememberedPath, activeLibIndex]);


    return {
        libraries, setLibraries,
        activeLibraryPath, setActiveLibraryPath: setRememberedPath,
        activeLibIndex, setActiveLibIndex, // Exposing setters for hydration
        needsSetup, setNeedsSetup,
        hostLibrariesLoaded,
        libraryLoadFailed,
        reloadHostLibraries: loadHostLibraries,
        selectLibrary,
        addLibrary,
        removeLibrary,
        reorderLibraries,
        browseAndAdd,
        activeLibIndexRef
    };
};
