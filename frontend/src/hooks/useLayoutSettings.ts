import { useState, useEffect } from 'react';

export interface LayoutSettings {
    viewMode: 'grid' | 'list';
    setViewMode: (v: 'grid' | 'list') => void;
    gridSize: number;
    setGridSize: (v: number) => void;
    isSidebarOpen: boolean;
    setIsSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
    isTagsVisible: boolean;
    setIsTagsVisible: (v: boolean) => void;
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

    const [isTagsVisible, setIsTagsVisible] = useState(() => {
        return localStorage.getItem('layout_isTagsVisible') === 'true';
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

    useEffect(() => {
        localStorage.setItem('layout_isTagsVisible', String(isTagsVisible));
    }, [isTagsVisible]);

    return {
        viewMode, setViewMode,
        gridSize, setGridSize,
        isSidebarOpen, setIsSidebarOpen,
        isTagsVisible, setIsTagsVisible
    };
};
