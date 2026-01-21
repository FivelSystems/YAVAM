import { useState, useCallback } from 'react';

export const useDragDrop = (activeLibraryPath: string) => {
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    // Queue now holds strings (Desktop) or File objects (Web)
    const [uploadQueue, setUploadQueue] = useState<(string | File)[]>([]);

    const handleDrop = useCallback(async (files: string[]) => {
        // Desktop Drop (Wails)
        if (!activeLibraryPath) return;
        setUploadQueue(prev => [...prev, ...files]);
        setIsUploadModalOpen(true);
    }, [activeLibraryPath]);

    // Web Native Drop Handler (via DragDropOverlay combined)
    const handleWebDrop = useCallback((files: FileList | File[]) => {
        // IGNORE if in Wails Desktop mode (handled by native OnFileDrop)
        // @ts-ignore
        if (window.go) return;

        if (!files || files.length === 0) return;
        const fileArray = files instanceof FileList ? Array.from(files) : files;

        // Open Modal
        setUploadQueue(prev => [...prev, ...fileArray]);
        setIsUploadModalOpen(true);
    }, []);

    return {
        isUploadModalOpen,
        setIsUploadModalOpen,
        uploadQueue,
        setUploadQueue,
        handleDrop,
        handleWebDrop
    };
};
