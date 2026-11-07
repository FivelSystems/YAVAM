import { useRef, useEffect, useState, useLayoutEffect } from 'react';
import { VarPackage } from '../../types';
import { RatingFavoriteControl } from './RatingFavoriteControl';
import { useLiveRatingFavorite } from '../../hooks/useLiveRatingFavorite';
import { usePackageActionItems, actionIconClassName } from '../../hooks/usePackageActionItems';
import { useAuth } from '../../features/auth/AuthContext';

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
    onCopyFiles: (pkgs: VarPackage[]) => void;
    onCutFile: (pkg: VarPackage) => void;
    onDelete: (pkg: VarPackage) => void;
    onMerge: (pkg: VarPackage) => void;
    onMergeInPlace: (pkg: VarPackage) => void;
    onResolve: (pkg: VarPackage) => void;
    onSetRating: (pkg: VarPackage, rating: number) => void;
    onSetFavorite: (pkg: VarPackage, favorite: boolean) => void;
}

const ContextMenu = ({ x, y, pkg, selectedCount = 0, onClose, onToggle, onOpenFolder, onDownload, onCopyPath, onCopyFiles, onCutFile, onDelete, onMerge, onMergeInPlace, onResolve, onSetRating, onSetFavorite }: ContextMenuProps) => {
    const ref = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ top: y, left: x });
    // @ts-ignore
    const isWeb = !window.go;
    const { isAuthenticated } = useAuth();
    // Guests (unauthenticated web sessions) must not get raw file downloads.
    const canDownloadFile = isWeb && isAuthenticated;

    // Live rating/favourite, independent of the (possibly stale) `pkg` prop
    // snapshot — `contextMenu.pkg` is captured once at right-click time, so it
    // doesn't update in place when a rating/favourite edit patches the live
    // `packages` array.
    const { rating, isFavorite, rate, toggleFavorite } = useLiveRatingFavorite(pkg, onSetRating, onSetFavorite);

    const items = usePackageActionItems({
        pkg, selectedCount, isWeb, canDownloadFile,
        onToggle, onOpenFolder, onDownload, onCopyPath, onCopyFiles, onCutFile, onDelete, onMerge, onMergeInPlace, onResolve,
    }).filter(item => !item.hidden);
    const regularItems = items.filter(item => item.tone !== 'danger');
    const dangerItems = items.filter(item => item.tone === 'danger');

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

            {/* Rating + favourite (user_metadata, version-agnostic per family) */}
            <div className="flex items-center justify-between px-3 py-1.5">
                <RatingFavoriteControl
                    rating={rating}
                    isFavorite={isFavorite}
                    onRate={rate}
                    onToggleFavorite={toggleFavorite}
                    size={15}
                />
            </div>

            <div className="border-t border-gray-700 my-1"></div>

            {regularItems.map(item => (
                <button
                    key={item.key}
                    onClick={() => { item.onClick(); onClose(); }}
                    className="w-full text-left px-3 py-2 hover:bg-gray-700 flex items-center gap-2 text-white"
                >
                    <item.icon size={16} className={actionIconClassName(item.key, pkg)} />
                    {item.label}
                </button>
            ))}

            {dangerItems.length > 0 && <div className="border-t border-gray-700 my-1"></div>}

            {dangerItems.map(item => (
                <button
                    key={item.key}
                    onClick={() => { item.onClick(); onClose(); }}
                    className="w-full text-left px-3 py-2 hover:bg-red-500/20 text-red-400 hover:text-red-300 flex items-center gap-2"
                >
                    <item.icon size={16} />
                    {item.label}
                </button>
            ))}
        </div>
    );
};

export default ContextMenu;
