import { useState, useEffect } from 'react';

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

    const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
        const stored = localStorage.getItem('layout_isSidebarOpen');
        return stored ? stored === 'true' : window.innerWidth > 768;
    });

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

    useEffect(() => {
        localStorage.setItem('layout_isSidebarOpen', String(isSidebarOpen));
    }, [isSidebarOpen]);

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
