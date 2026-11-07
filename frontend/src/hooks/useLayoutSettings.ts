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

    // The sidebar is navigation state, not a persisted display preference — it
    // gates access to the library switcher itself, unlike viewMode/gridSize/
    // sortMode. Desktop always starts open; mobile always starts closed. Either
    // can still be toggled within the session, that toggle just isn't remembered
    // across loads or breakpoint crossings.
    const [isSidebarOpen, _setIsSidebarOpen] = useState(() => window.innerWidth > 768);
    const isMobileRef = useRef(window.innerWidth <= 768);

    const setIsSidebarOpen: React.Dispatch<React.SetStateAction<boolean>> = (value) => {
        _setIsSidebarOpen(prev => (typeof value === 'function' ? (value as (p: boolean) => boolean)(prev) : value));
    };

    // Pure CSS (Tailwind `md:` classes) already reacts live to resizing; this
    // only re-syncs the JS-computed open/closed state, which is otherwise fixed
    // at mount — closing the drawer when live-resizing into mobile, and
    // reopening it when resizing back out to desktop.
    useEffect(() => {
        const handleResize = () => {
            const isMobile = window.innerWidth <= 768;
            if (isMobile === isMobileRef.current) return;
            isMobileRef.current = isMobile;
            _setIsSidebarOpen(!isMobile);
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
