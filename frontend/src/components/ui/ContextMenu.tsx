import { VarPackage } from '../../types';
import { RatingFavoriteControl } from './RatingFavoriteControl';
import { useLiveRatingFavorite } from '../../hooks/useLiveRatingFavorite';
import { usePackageActionItems, actionIconClassName } from '../../hooks/usePackageActionItems';
import { useAuth } from '../../features/auth/AuthContext';
import { AnchoredMenu, MenuItem, MenuDivider } from './AnchoredMenu';

interface ContextMenuProps {
    x: number;
    y: number;
    pkg: VarPackage;
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

/** Per-package right-click popover — a thin `AnchoredMenu` configuration built
 * from the header, the rating/favourite row, and {@link usePackageActionItems}. */
const ContextMenu = ({ x, y, pkg, selectedCount = 0, onClose, onToggle, onOpenFolder, onDownload, onCopyPath, onCopyFiles, onCutFile, onDelete, onMerge, onMergeInPlace, onResolve, onSetRating, onSetFavorite }: ContextMenuProps) => {
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

    return (
        <AnchoredMenu anchor={{ x, y }} onClose={onClose} className="w-56">
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

            <MenuDivider />

            {regularItems.map(item => (
                <MenuItem key={item.key} icon={<item.icon size={16} className={actionIconClassName(item.key, pkg)} />} onSelect={item.onClick}>
                    {item.label}
                </MenuItem>
            ))}

            {dangerItems.length > 0 && <MenuDivider />}

            {dangerItems.map(item => (
                <MenuItem key={item.key} tone="danger" icon={<item.icon size={16} />} onSelect={item.onClick}>
                    {item.label}
                </MenuItem>
            ))}
        </AnchoredMenu>
    );
};

export default ContextMenu;
