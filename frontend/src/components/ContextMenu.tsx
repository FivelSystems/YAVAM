import { useEffect, useRef } from 'react';
import { VarPackage } from '../App';
import { Eye, EyeOff, Star, Power } from 'lucide-react';

interface ContextMenuProps {
    x: number;
    y: number;
    pkg: VarPackage | null;
    onClose: () => void;
    onToggle: (pkg: VarPackage) => void;
    onHide?: (pkg: VarPackage) => void;
    onFavorite?: (pkg: VarPackage) => void;
}

const ContextMenu = ({ x, y, pkg, onClose, onToggle, onHide, onFavorite }: ContextMenuProps) => {
    const ref = useRef<HTMLDivElement>(null);

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
            className="fixed bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 z-50 w-48 text-sm"
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

            <button
                onClick={() => { if (onFavorite) onFavorite(pkg); onClose(); }}
                className="w-full text-left px-3 py-2 hover:bg-gray-700 flex items-center gap-2 text-white"
            >
                <Star size={16} className={pkg.isFavorite ? "text-yellow-500 fill-yellow-500" : "text-gray-400"} />
                {pkg.isFavorite ? "Unfavorite" : "Favorite"}
            </button>

            <button
                onClick={() => { if (onHide) onHide(pkg); onClose(); }}
                className="w-full text-left px-3 py-2 hover:bg-gray-700 flex items-center gap-2 text-white"
            >
                {pkg.isHidden ? <Eye size={16} className="text-blue-400" /> : <EyeOff size={16} className="text-gray-400" />}
                {pkg.isHidden ? "Unhide" : "Hide"}
            </button>
        </div>
    );
};

export default ContextMenu;
