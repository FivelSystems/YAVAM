import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { VarPackage } from '../../types';
import { RatingFavoriteControl } from './RatingFavoriteControl';
import { useLiveRatingFavorite } from '../../hooks/useLiveRatingFavorite';
import { usePackageActionItems, actionIconClassName } from '../../hooks/usePackageActionItems';

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
 * touch has no right-click equivalent. Reuses `Modal.tsx`'s body-scroll-lock
 * and Escape/backdrop-dismiss idioms rather than reinventing them.
 */
export const ActionSheet = ({
    pkg, selectedCount = 0, onClose,
    onToggle, onOpenFolder, onDownload, onCopyPath, onCopyFiles, onCutFile, onDelete, onMerge, onMergeInPlace, onResolve,
    onSetRating, onSetFavorite,
}: ActionSheetProps) => {
    // @ts-ignore
    const isWeb = !window.go;
    const isOpen = !!pkg;

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

    const { rating, isFavorite, rate, toggleFavorite } = useLiveRatingFavorite(pkg, onSetRating, onSetFavorite);

    const items = usePackageActionItems({
        pkg, selectedCount, isWeb,
        onToggle, onOpenFolder, onDownload, onCopyPath, onCopyFiles, onCutFile, onDelete, onMerge, onMergeInPlace, onResolve,
    }).filter(item => !item.hidden);

    return createPortal(
        <AnimatePresence>
            {isOpen && pkg && (
                <div
                    className="fixed inset-0 z-50 flex items-end justify-center"
                    role="dialog"
                    aria-modal="true"
                    aria-label={selectedCount > 1 ? `${selectedCount} items selected` : (pkg.meta.packageName || pkg.fileName)}
                >
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
                    />

                    <motion.div
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                        className="relative z-10 w-full max-w-md bg-gray-800 border-t border-gray-700 rounded-t-2xl shadow-2xl max-h-[85vh] flex flex-col"
                    >
                        <div className="px-4 pt-3 pb-3 border-b border-gray-700/50 shrink-0">
                            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-600" />
                            <h2 className="text-sm font-semibold text-gray-200 truncate">
                                {selectedCount > 1 ? `${selectedCount} items selected` : (pkg.meta.packageName || pkg.fileName)}
                            </h2>
                        </div>

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
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
};

export default ActionSheet;
