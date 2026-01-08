import { Upload } from 'lucide-react';
import { useState, useEffect } from 'react';
import { OnFileDrop, OnFileDropOff } from '../wailsjs/runtime/runtime';

interface DragDropOverlayProps {
    onDrop: (files: string[]) => void;
    onWebUpload?: (files: FileList) => void;
}

const DragDropOverlay = ({ onDrop, onWebUpload }: DragDropOverlayProps) => {
    // @ts-ignore
    const isWeb = !window.go;
    const [isDragging, setIsDragging] = useState(false);

    useEffect(() => {
        const handleDragOver = (e: DragEvent) => {
            e.preventDefault();
            setIsDragging(true);
        };

        const handleDragLeave = (e: DragEvent) => {
            e.preventDefault();
            if (e.clientX === 0 && e.clientY === 0) {
                setIsDragging(false);
            }
        };

        const handleDrop = (e: DragEvent) => {
            e.preventDefault();
            setIsDragging(false);
            if (isWeb && onWebUpload && e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
                onWebUpload(e.dataTransfer.files);
            }
        };

        window.addEventListener('dragover', handleDragOver);
        window.addEventListener('dragleave', handleDragLeave);
        window.addEventListener('drop', handleDrop);

        if (!isWeb) {
            // @ts-ignore
            OnFileDrop((_x, _y, paths) => {
                setIsDragging(false);
                if (paths && paths.length > 0) {
                    onDrop(paths);
                }
            }, false);
        }

        return () => {
            window.removeEventListener('dragover', handleDragOver);
            window.removeEventListener('dragleave', handleDragLeave);
            window.removeEventListener('drop', handleDrop);
            if (!isWeb) OnFileDropOff();
        };
    }, [onDrop, onWebUpload]);

    if (!isDragging) return null;

    return (
        <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center border-4 border-blue-500 border-dashed m-4 rounded-xl animate-in fade-in duration-200 pointer-events-none">
            <Upload size={64} className="text-blue-400 mb-4 animate-bounce" />
            <h2 className="text-3xl font-bold text-white mb-2">Drop Packages Here</h2>
            <p className="text-gray-300">{isWeb ? "Upload to Server" : "Add .var files to your library"}</p>
        </div>
    );
};

export default DragDropOverlay;
