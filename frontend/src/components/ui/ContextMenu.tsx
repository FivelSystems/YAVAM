import { useRef, useEffect, useState, useLayoutEffect } from 'react';
import { VarPackage } from '../../types';
import { Power, FolderOpen, Copy, Trash2, FileCode, Scissors, Download, Layers, Sparkles } from 'lucide-react';

interface ContextMenuProps {
    x: number;
    y: number;
    pkg: VarPackage | null;
    selectedCount?: number;
    onClose: () => void;
    onToggle: (pkg: VarPackage) => void;
    onOpenFolder: (pkg: VarPackage) => void;
    onDownload: (pkg: VarPackage) => void;
    onCopyPath: (pkg: VarPackage) => void;
    onCopyFile: (pkg: VarPackage) => void;
    onCutFile: (pkg: VarPackage) => void;
    onDelete: (pkg: VarPackage) => void;
    onMerge: (pkg: VarPackage) => void;
    onMergeInPlace: (pkg: VarPackage) => void;
    onResolve: (pkg: VarPackage) => void;
}

const ContextMenu = ({ x, y, pkg, selectedCount = 0, onClose, onToggle, onOpenFolder, onDownload, onCopyPath, onCopyFile, onCutFile, onDelete, onMerge, onMergeInPlace, onResolve }: ContextMenuProps) => {
    const ref = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ top: y, left: x });
    // @ts-ignore
    const isWeb = !window.go;

    useLayoutEffect(() => {
        if (ref.current) {
            const rect = ref.current.getBoundingClientRect();
            const winWidth = window.innerWidth;
            const winHeight = window.innerHeight;

            let newLeft = x;
            let newTop = y;

            // Check Right edge
            if (x + rect.width > winWidth) {
                newLeft = winWidth - rect.width - 10; // 10px padding
            }
            // Check Bottom edge
            if (y + rect.height > winHeight) {
                newTop = winHeight - rect.height - 10;
            }

            // Ensure not off-screen top/left
            if (newLeft < 0) newLeft = 10;
            if (newTop < 0) newTop = 10;

            setPosition({ top: newTop, left: newLeft });
        }
    }, [x, y]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                onClose();
            }
        };
        // Use mousedown to capture earlier
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    if (!pkg) return null;

    return (
        <div
            ref={ref}
            className="fixed bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 z-50 w-56 text-sm"
            style={{ top: position.top, left: position.left }}
        >
            <div className="px-3 py-2 text-xs font-semibold text-gray-500 border-b border-gray-700 mb-1 truncate">
                {selectedCount > 1 ? `${selectedCount} items selected` : pkg.fileName}
            </div>

            <button
                onClick={() => { onToggle(pkg); onClose(); }}
                className="w-full text-left px-3 py-2 hover:bg-gray-700 flex items-center gap-2 text-white"
            >
                <Power size={16} className={pkg.isEnabled ? "text-red-400" : "text-green-400"} />
                {selectedCount > 1 ? "Toggle Selected" : (pkg.isEnabled ? "Disable" : "Enable")}
            </button>



            <div className="border-t border-gray-700 my-1"></div>

            {/* Optimization Actions */}
            {(pkg.isExactDuplicate) && (
                <>
                    <div className="h-px bg-gray-700 my-1 mx-2" />
                    <button
                        onClick={() => { onMerge(pkg); onClose(); }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-700 flex items-center gap-2 text-white"
                    >
                        <Layers size={16} className="text-purple-400" />
                        Merge to Root
                    </button>
                    <button
                        onClick={() => { onMergeInPlace(pkg); onClose(); }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-700 flex items-center gap-2 text-white"
                    >
                        <Layers size={16} className="text-purple-400" />
                        Merge in Place
                    </button>
                </>
            )}
            {/* Obsolete Fix (Non-Duplicate) */}
            {(!pkg.isExactDuplicate && pkg.isDuplicate) && (
                <button
                    onClick={() => { onResolve(pkg); onClose(); }}
                    className="w-full text-left px-3 py-2 hover:bg-gray-700 flex items-center gap-2 text-white"
                >
                    <Sparkles size={16} className="text-yellow-400" />
                    Fix Obsolete
                </button>
            )}

            {!isWeb && (
                <button
                    onClick={() => { onOpenFolder(pkg); onClose(); }}
                    className="w-full text-left px-3 py-2 hover:bg-gray-700 flex items-center gap-2 text-white"
                >
                    <FolderOpen size={16} className="text-blue-400" />
                    Open Folder
                </button>
            )}

            <button
                onClick={() => { onCopyPath(pkg); onClose(); }}
                className="w-full text-left px-3 py-2 hover:bg-gray-700 flex items-center gap-2 text-white"
            >
                <FileCode size={16} className="text-gray-400" />
                Copy Path
            </button>

            {!isWeb && (
                <>
                    <button
                        onClick={() => { onCopyFile(pkg); onClose(); }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-700 flex items-center gap-2 text-white"
                    >
                        <Copy size={16} className="text-gray-400" />
                        Copy File
                    </button>

                    <button
                        onClick={() => { onCutFile(pkg); onClose(); }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-700 flex items-center gap-2 text-white"
                    >
                        <Scissors size={16} className="text-gray-400" />
                        Cut File
                    </button>
                </>
            )}


            <button
                onClick={() => { onDownload(pkg); onClose(); }}
                className="w-full text-left px-3 py-2 hover:bg-gray-700 flex items-center gap-2 text-white"
            >
                <Download size={16} className="text-blue-400" />
                Install to Library
            </button>

            {isWeb && (
                <button
                    onClick={() => {
                        onClose();
                        // Download directly
                        const token = localStorage.getItem('yavam_auth_token');
                        const url = `/files/?path=${encodeURIComponent(pkg.filePath)}&token=${token || ''}`;
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = pkg.fileName;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-gray-700 flex items-center gap-2 text-white"
                >
                    <Download size={16} className="text-green-400" />
                    Download File
                </button>
            )}

            <div className="border-t border-gray-700 my-1"></div>

            <button
                onClick={() => { onDelete(pkg); onClose(); }}
                className="w-full text-left px-3 py-2 hover:bg-red-500/20 text-red-400 hover:text-red-300 flex items-center gap-2"
            >
                <Trash2 size={16} />
                Delete {selectedCount > 1 ? `(${selectedCount})` : ""}
            </button>
        </div>
    );
};

export default ContextMenu;
