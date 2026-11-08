import clsx from 'clsx';
import { VarPackage } from '../../types';
import { RatingFavoriteControl } from './RatingFavoriteControl';
import { BottomSheet } from './BottomSheet';
import { useLiveRatingFavorite } from '../../hooks/useLiveRatingFavorite';
import { usePackageActionItems, actionIconClassName } from '../../hooks/usePackageActionItems';
import { useAuth } from '../../features/auth/AuthContext';

interface ActionSheetProps {
    /** Null closes the sheet (and plays its exit animation) rather than unmounting it. */
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

// Comfortably above WCAG's 44px minimum tappable-target guidance — this is the
// sole mobile entry point to package actions, so rows get the larger target
// the card's compact hover row doesn't need.
const ROW_MIN_HEIGHT = 'min-h-[48px]';

/**
 * Mobile presentation of "what the right-click menu shows on desktop" — a
 * bottom sheet opened via the card's overflow button or a long-press, since
 * touch has no right-click equivalent. The sheet shell lives in `BottomSheet`.
 */
export const ActionSheet = ({
    pkg, selectedCount = 0, onClose,
    onToggle, onOpenFolder, onDownload, onCopyPath, onCopyFiles, onCutFile, onDelete, onMerge, onMergeInPlace, onResolve,
    onSetRating, onSetFavorite,
}: ActionSheetProps) => {
    // @ts-ignore
    const isWeb = !window.go;
    const { isAuthenticated } = useAuth();
    // Guests (unauthenticated web sessions) must not get raw file downloads.
    const canDownloadFile = isWeb && isAuthenticated;

    const { rating, isFavorite, rate, toggleFavorite } = useLiveRatingFavorite(pkg, onSetRating, onSetFavorite);

    const items = usePackageActionItems({
        pkg, selectedCount, isWeb, canDownloadFile,
        onToggle, onOpenFolder, onDownload, onCopyPath, onCopyFiles, onCutFile, onDelete, onMerge, onMergeInPlace, onResolve,
    }).filter(item => !item.hidden);

    const title = pkg ? (selectedCount > 1 ? `${selectedCount} items selected` : (pkg.meta.packageName || pkg.fileName)) : '';

    return (
        <BottomSheet isOpen={!!pkg} title={title} onClose={onClose}>
            {pkg && (
                <>
                    <div className="px-4 py-3 flex justify-center border-b border-gray-700/50 shrink-0">
                        <RatingFavoriteControl
                            rating={rating}
                            isFavorite={isFavorite}
                            onRate={rate}
                            onToggleFavorite={toggleFavorite}
                            layout="row"
                            size={22}
                        />
                    </div>

                    <div className="py-2 overflow-y-auto custom-scrollbar">
                        {items.map(item => (
                            <button
                                key={item.key}
                                onClick={() => { item.onClick(); onClose(); }}
                                className={clsx(
                                    'w-full flex items-center gap-3 px-4 text-left transition-colors',
                                    ROW_MIN_HEIGHT,
                                    item.tone === 'danger'
                                        ? 'text-red-400 hover:bg-red-500/10'
                                        : 'text-gray-100 hover:bg-gray-700/60'
                                )}
                            >
                                <item.icon size={18} className={item.tone === 'danger' ? undefined : actionIconClassName(item.key, pkg)} />
                                <span className="text-sm font-medium">{item.label}</span>
                            </button>
                        ))}
                    </div>
                </>
            )}
        </BottomSheet>
    );
};

export default ActionSheet;
