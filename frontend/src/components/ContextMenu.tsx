import { useEffect, useRef } from 'react';
import { VarPackage } from '../App';
import { Power, FolderOpen, Copy, Trash2, FileCode, Scissors, Download } from 'lucide-react';

interface ContextMenuProps {
    x: number;
    y: number;
    pkg: VarPackage | null;
    onClose: () => void;
    onToggle: (pkg: VarPackage) => void;
    onOpenFolder: (pkg: VarPackage) => void;
    onDownload: (pkg: VarPackage) => void;
    onCopyPath: (pkg: VarPackage) => void;
    onCopyFile: (pkg: VarPackage) => void;
    onCutFile: (pkg: VarPackage) => void;
    onDelete: (pkg: VarPackage) => void;
}

const ContextMenu = ({ x, y, pkg, onClose, onToggle, onOpenFolder, onDownload, onCopyPath, onCopyFile, onCutFile, onDelete }: ContextMenuProps) => {
    const ref = useRef<HTMLDivElement>(null);
    // @ts-ignore
    const isWeb = !window.go;

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    if (!pkg) return null;

    return (
        <div
            ref={ref}
            className="fixed bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 z-50 w-56 text-sm"
            style={{ top: y, left: x }}
        >
            <div className="px-3 py-2 text-xs font-semibold text-gray-500 border-b border-gray-700 mb-1 truncate">
                {pkg.fileName}
            </div>

            <button
                onClick={() => { onToggle(pkg); onClose(); }}
                className="w-full text-left px-3 py-2 hover:bg-gray-700 flex items-center gap-2 text-white"
            >
                <Power size={16} className={pkg.isEnabled ? "text-red-400" : "text-green-400"} />
                {pkg.isEnabled ? "Disable" : "Enable"}
            </button>

            <div className="border-t border-gray-700 my-1"></div>

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

            <div className="border-t border-gray-700 my-1"></div>

            <button
                onClick={() => { onDelete(pkg); onClose(); }}
                className="w-full text-left px-3 py-2 hover:bg-red-500/20 text-red-400 hover:text-red-300 flex items-center gap-2"
            >
                <Trash2 size={16} />
                Delete
            </button>
        </div>
    );
};

export default ContextMenu;
