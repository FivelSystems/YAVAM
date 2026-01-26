import { useState, useEffect, useCallback, useRef } from 'react';
import { config } from '../wailsjs/go/models';
import { fetchWithAuth } from '../services/api';

export const useLibrary = () => {
    // -- State --
    const [libraries, setLibraries] = useState<string[]>([]);
    const [activeLibraryPath, setActiveLibraryPath] = useState<string>(() => {
        const current = localStorage.getItem("activeLibraryPath");
        if (current) return current;
        const saved = localStorage.getItem("savedLibraries");
        const libs = saved ? JSON.parse(saved) : [];
        return libs.length > 0 ? libs[0] : "";
    });
    const [activeLibIndex, setActiveLibIndex] = useState(0);
    const [needsSetup, setNeedsSetup] = useState(false);

    // Ref for stale closure access
    const activeLibIndexRef = useRef(activeLibIndex);
    useEffect(() => {
        activeLibIndexRef.current = activeLibIndex;
    }, [activeLibIndex]);

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
            setActiveLibraryPath(path);
            localStorage.setItem("activeLibraryPath", path);
        }
    }, [libraries]);

    const addLibrary = useCallback((path: string) => {
        if (!path) return;

        if (libraries.includes(path)) {
            selectLibrary(path);
            return;
        }

        const newLibs = [...libraries, path];
        setLibraries(newLibs);
        localStorage.setItem("savedLibraries", JSON.stringify(newLibs));
        selectLibrary(path); // Select the new library

        // Sync Backend
        // @ts-ignore
        if (window.go && window.go.main && window.go.main.App) {
            // @ts-ignore
            window.go.main.App.AddConfiguredLibrary(path);
        }
    }, [libraries, selectLibrary]);

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
                setActiveLibraryPath(newPath);
                localStorage.setItem("activeLibraryPath", newPath);
            } else if (index === activeLibIndex) {
                // Removed currently active?
                const newPath = newLibs[activeLibIndex] || (newLibs.length > 0 ? newLibs[0] : "");
                setActiveLibraryPath(newPath);
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
        const newIdx = newOrder.indexOf(activeLibraryPath);
        if (newIdx !== -1) {
            setActiveLibIndex(newIdx);
        }
    }, [activeLibraryPath]);

    // Desktop: Browse
    const browseAndAdd = useCallback(async () => {
        // @ts-ignore
        if (window.go) {
            try {
                // @ts-ignore
                const p = await window.go.main.App.SelectDirectory();
                if (p) addLibrary(p);
            } catch (e) {
                console.error(e);
            }
        }
    }, [addLibrary]);


    // Initialization Effect (Sync with Backend/WebAPI)
    useEffect(() => {
        // @ts-ignore
        if (window.go && window.go.main && window.go.main.App) {
            // Desktop Mode: Fetch saved config
            // @ts-ignore
            window.go.main.App.GetConfig().then((cfg: config.Config) => {
                if (cfg && cfg.libraries) {
                    setLibraries(cfg.libraries);

                    const current = activeLibraryPath; // Closure?
                    const isValid = cfg.libraries.some((l: string) => l.toLowerCase() === current.toLowerCase());

                    if ((!current || !isValid) && cfg.libraries.length > 0) {
                        selectLibrary(cfg.libraries[0]);
                    }
                }
            }).catch((err: any) => console.error("Failed to load library config:", err));
        } else {
            // Web Mode: Fetch config via API
            fetchWithAuth('/api/config')
                .then(res => {
                    if (!res.ok) throw new Error("Failed to fetch config");
                    return res.json();
                })
                .then(data => {
                    if (data && data.libraries) {
                        setLibraries(data.libraries);

                        // Validate active path
                        const current = activeLibraryPath;
                        const isValid = data.libraries.some((l: string) => l.toLowerCase() === current.toLowerCase());

                        // If empty or invalid, select first available
                        if ((!current || !isValid) && data.libraries.length > 0) {
                            selectLibrary(data.libraries[0]);
                        }
                    }
                })
                .catch(err => console.error("Web Config Load Error:", err));
        }

    }, []);

    // Also: Sync Active Index when libraries list changes (Refactored from Dashboard)
    useEffect(() => {
        if (activeLibraryPath && libraries.length > 0) {
            const idx = libraries.findIndex(l => l.toLowerCase() === activeLibraryPath.toLowerCase());
            if (idx !== -1 && idx !== activeLibIndex) {
                setActiveLibIndex(idx);
            }
        }
    }, [libraries, activeLibraryPath, activeLibIndex]);


    return {
        libraries, setLibraries,
        activeLibraryPath, setActiveLibraryPath,
        activeLibIndex, setActiveLibIndex, // Exposing setters for hydration
        needsSetup, setNeedsSetup,
        selectLibrary,
        addLibrary,
        removeLibrary,
        reorderLibraries,
        browseAndAdd,
        activeLibIndexRef
    };
};
