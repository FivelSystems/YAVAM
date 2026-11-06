import { useState, useEffect, useRef } from 'react';

export interface LayoutSettings {
    viewMode: 'grid' | 'list';
    setViewMode: (v: 'grid' | 'list') => void;
    gridSize: number;
    setGridSize: (v: number) => void;
    isSidebarOpen: boolean;
    setIsSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
    minimizeOnClose: boolean;
    setMinimizeOnClose: (v: boolean) => void;
}

export const useLayoutSettings = (): LayoutSettings => {
    // -- State Initialization (Lazy Load) --
    const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
        return (localStorage.getItem('layout_viewMode') as 'grid' | 'list') ||
            (window.innerWidth < 768 ? 'list' : 'grid');
    });

    const [gridSize, setGridSize] = useState(() => {
        const stored = localStorage.getItem('layout_gridSize');
        return stored ? parseInt(stored, 10) : 200;
    });

    const [isSidebarOpen, _setIsSidebarOpen] = useState(() => {
        // The stored value is a desktop rail-collapse preference; it must never
        // carry an "open" drawer into a narrow viewport (e.g. a browser window
        // resized smaller, or a device-emulation toggle reusing the same origin's
        // storage), since the mobile sidebar is an overlay, not a rail.
        if (window.innerWidth <= 768) return false;
        const stored = localStorage.getItem('layout_isSidebarOpen');
        return stored ? stored === 'true' : true;
    });
    const isMobileRef = useRef(window.innerWidth <= 768);

    // Explicit user action (toggle button, keybind, backdrop click) — persists
    // as the desktop preference. Distinct from the resize effect below, which
    // must adjust isSidebarOpen live without overwriting that preference.
    const setIsSidebarOpen: React.Dispatch<React.SetStateAction<boolean>> = (value) => {
        _setIsSidebarOpen(prev => {
            const next = typeof value === 'function' ? (value as (p: boolean) => boolean)(prev) : value;
            if (!isMobileRef.current) localStorage.setItem('layout_isSidebarOpen', String(next));
            return next;
        });
    };

    // Pure CSS (Tailwind `md:` classes) already reacts live to resizing; this
    // only re-syncs the JS-computed open/closed state, which is otherwise fixed
    // at mount — closing the drawer when live-resizing into mobile, and
    // restoring the desktop preference when resizing back out, without ever
    // letting the automatic mobile-close overwrite that preference in storage.
    useEffect(() => {
        const handleResize = () => {
            const isMobile = window.innerWidth <= 768;
            if (isMobile === isMobileRef.current) return;
            isMobileRef.current = isMobile;
            if (isMobile) {
                _setIsSidebarOpen(false);
            } else {
                const stored = localStorage.getItem('layout_isSidebarOpen');
                _setIsSidebarOpen(stored ? stored === 'true' : true);
            }
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const [minimizeOnClose, setMinimizeOnClose] = useState(() => {
        return localStorage.getItem('app_minimizeOnClose') === 'true';
    });

    // -- Persistence Effects --
    useEffect(() => {
        localStorage.setItem('layout_viewMode', viewMode);
    }, [viewMode]);

    useEffect(() => {
        localStorage.setItem('layout_gridSize', String(gridSize));
    }, [gridSize]);

    // Sync Minimize setting to Backend
    useEffect(() => {
        localStorage.setItem('app_minimizeOnClose', String(minimizeOnClose));
        // @ts-ignore
        if (window.go && window.go.main && window.go.main.App) {
            // @ts-ignore
            window.go.main.App.SetMinimizeOnClose(minimizeOnClose);
        }
    }, [minimizeOnClose]);

    return {
        viewMode, setViewMode,
        gridSize, setGridSize,
        isSidebarOpen, setIsSidebarOpen,
        minimizeOnClose, setMinimizeOnClose
    };
};
