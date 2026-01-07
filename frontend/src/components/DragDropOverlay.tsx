import { Upload } from 'lucide-react';
import { useState, useEffect } from 'react';
import { OnFileDrop, OnFileDropOff } from '../wailsjs/runtime/runtime';

interface DragDropOverlayProps {
    onDrop: (files: string[]) => void;
}

const DragDropOverlay = ({ onDrop }: DragDropOverlayProps) => {
    const [isDragging, setIsDragging] = useState(false);

    useEffect(() => {
        // Handle drag events on the window to allow fullscreen drop
        const handleDragOver = (e: DragEvent) => {
            e.preventDefault();
            setIsDragging(true);
        };

        const handleDragLeave = (e: DragEvent) => {
            e.preventDefault();
            // simple check to avoid flickering when entering children
            if (e.clientX === 0 && e.clientY === 0) {
                setIsDragging(false);
            }
        };

        const handleDrop = (e: DragEvent) => {
            e.preventDefault();
            setIsDragging(false);
            // We rely on Wails OnFileDrop for the actual files
        };

        window.addEventListener('dragover', handleDragOver);
        window.addEventListener('dragleave', handleDragLeave);
        window.addEventListener('drop', handleDrop);

        // Register Wails OnFileDrop listener
        // @ts-ignore
        OnFileDrop((_x, _y, paths) => {
            console.log("Wails OnFileDrop triggered", paths);
            setIsDragging(false);
            if (paths && paths.length > 0) {
                onDrop(paths);
            }
        }, false);

        return () => {
            window.removeEventListener('dragover', handleDragOver);
            window.removeEventListener('dragleave', handleDragLeave);
            window.removeEventListener('drop', handleDrop);
            OnFileDropOff();
        };
    }, [onDrop]);

    if (!isDragging) return null;

    return (
        <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center border-4 border-blue-500 border-dashed m-4 rounded-xl animate-in fade-in duration-200">
            <Upload size={64} className="text-blue-400 mb-4 animate-bounce" />
            <h2 className="text-3xl font-bold text-white mb-2">Drop Packages Here</h2>
            <p className="text-gray-300">Add .var files to your library</p>
        </div>
    );
};

export default DragDropOverlay;
