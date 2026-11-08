import { useRef, useState, useEffect, useLayoutEffect, memo } from 'react';
import { createPortal } from 'react-dom';
import { VarPackage } from '../../types';
import clsx from 'clsx';
import { AlertCircle, Check, AlertTriangle, Power, Copy, Star, Heart, MoreVertical } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatBytes } from '../../utils/format';
import { RatingFavoriteControl } from '../../components/ui/RatingFavoriteControl';
import { useLongPress } from '../../hooks/useLongPress';
import { getStoredToken } from '../../services/auth';
import { useInViewport } from '../../hooks/useInViewport';
import { useScanReveal } from '../../hooks/useScanReveal';
import PackageSkeleton from './components/PackageSkeleton';
import { getCardState, isPendingCardState } from './utils';

/** Passive rating/favourite pill — the only persistent sign of either on the
 * card itself (previously only visible via the context menu that set them, #54).
 * Only renders when there's something to show; at rest it is not interactive —
 * {@link RatingFavoritePopoverBadge} below wraps it with the click-to-edit behavior. */
const RatingFavoriteBadge = ({ rating, isFavorite }: { rating?: number; isFavorite?: boolean }) => {
    if (!rating && !isFavorite) return null;
    return (
        <div className="flex items-center gap-1 bg-gray-900/80 backdrop-blur-sm px-1.5 py-0.5 rounded-full border border-gray-700/50 shrink-0">
            {!!isFavorite && <Heart size={11} className="fill-pink-400 text-pink-400" />}
            {!!rating && (
                <span className="flex items-center gap-0.5 text-[10px] font-semibold text-yellow-400">
                    <Star size={11} className="fill-yellow-400 text-yellow-400" />
                    {rating}
                </span>
            )}
        </div>
    );
};

/**
 * Click target for the badge above — opens a small floating popover with the
 * full `RatingFavoriteControl`, anchored just below it. Decoupled from card
 * hover entirely (see `docs/design/package-card-rework.md` §2, revised after
 * live review): hovering the card no longer reveals anything here, and a
 * package with neither a rating nor a favourite renders nothing in this
 * corner at all — the right-click `ContextMenu` / long-press `ActionSheet`
 * remain the only way to rate a never-rated package from the grid.
 */
const RatingFavoritePopoverBadge = ({
    pkg, onRate, onToggleFavorite,
}: {
    pkg: VarPackage;
    onRate: (pkg: VarPackage, rating: number) => void;
    onToggleFavorite: (pkg: VarPackage, favorite: boolean) => void;
}) => {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        if (!open) return;
        const rect = triggerRef.current?.getBoundingClientRect();
        if (rect) setPos({ top: rect.bottom + 6, left: rect.left });
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const closeOnOutsideInteraction = (e: Event) => {
            const target = e.target as Node;
            if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
            setOpen(false);
        };
        const closeOnEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', closeOnOutsideInteraction);
        document.addEventListener('touchstart', closeOnOutsideInteraction);
        document.addEventListener('keydown', closeOnEscape);
        window.addEventListener('scroll', closeOnOutsideInteraction, true);
        return () => {
            document.removeEventListener('mousedown', closeOnOutsideInteraction);
            document.removeEventListener('touchstart', closeOnOutsideInteraction);
            document.removeEventListener('keydown', closeOnEscape);
            window.removeEventListener('scroll', closeOnOutsideInteraction, true);
        };
    }, [open]);

    if (!pkg.rating && !pkg.isFavorite) return null;

    return (
        <>
            <button
                ref={triggerRef}
                onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
                className="appearance-none bg-transparent border-0 p-0 m-0 block"
                title="Rating & favourite"
            >
                <RatingFavoriteBadge rating={pkg.rating} isFavorite={pkg.isFavorite} />
            </button>
            {createPortal(
                <AnimatePresence>
                    {open && pos && (
                        <motion.div
                            ref={popoverRef}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            transition={{ duration: 0.12 }}
                            onClick={(e) => e.stopPropagation()}
                            className="fixed z-50 bg-gray-900/95 backdrop-blur-sm rounded-full border border-gray-700/50 px-2 py-1 shadow-lg"
                            style={{ top: pos.top, left: pos.left }}
                        >
                            <RatingFavoriteControl
                                rating={pkg.rating ?? 0}
                                isFavorite={!!pkg.isFavorite}
                                onRate={(n) => onRate(pkg, n)}
                                onToggleFavorite={() => onToggleFavorite(pkg, !pkg.isFavorite)}
                                layout="compact"
                                size={14}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body,
            )}
        </>
    );
};

interface PackageCardProps {
    pkg: VarPackage;
    onContextMenu: (e: React.MouseEvent, pkg: VarPackage) => void;
    onSelect: (pkg: VarPackage, e?: React.MouseEvent) => void;
    onRate: (pkg: VarPackage, rating: number) => void;
    onToggleFavorite: (pkg: VarPackage, favorite: boolean) => void;
    /** Opens the mobile action sheet for this package — the card's overflow
     * button and its long-press gesture both lead here; it's the only way to
     * reach any package action on touch (no right-click equivalent there). */
    onOpenActionSheet: (pkg: VarPackage) => void;
    isSelected?: boolean;
    isAnchor?: boolean;
    viewMode?: 'grid' | 'list';
    censorThumbnails?: boolean;
    blurAmount?: number;
    hidePackageNames?: boolean;
    hideCreatorNames?: boolean;
    isHighlighted?: boolean;
    startAnimationTs?: number; // Timestamp to force animation restart (used as key)
    isScanActive?: boolean;
}

const PackageCard = memo(({ pkg, onContextMenu, onSelect, onRate, onToggleFavorite, onOpenActionSheet, isSelected, isAnchor, viewMode = 'grid', censorThumbnails = false, blurAmount = 10, hidePackageNames = false, hideCreatorNames = false, isHighlighted = false, startAnimationTs, isScanActive = false }: PackageCardProps) => {
    const cardRef = useRef<HTMLDivElement>(null);
    const longPress = useLongPress(() => onOpenActionSheet(pkg));
    const cardState = getCardState(pkg);
    const isListed = cardState === 'listed';
    const isPending = isPendingCardState(cardState);
    const isShimmerVisible = useInViewport(cardRef, isScanActive && isPending);
    const revealClassName = useScanReveal(isPending, isScanActive);

    // ── All hooks must be declared unconditionally (Rules of Hooks) ───────────
    // Do NOT add early returns before these declarations.

    // Async thumbnail for web mode / desktop lazy-load
    const [asyncThumb, setAsyncThumb] = useState<string | undefined>(undefined);
    const [isVisible, setIsVisible] = useState(false);

    const thumbSrc = pkg.thumbnailBase64
        ? `data:image/jpeg;base64,${pkg.thumbnailBase64}`
        : asyncThumb;

    // Scroll Into View when Anchor
    useEffect(() => {
        if (isAnchor && cardRef.current) {
            cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [isAnchor]);

    // Lazy Loading Logic
    useEffect(() => {
        if (isListed) return;

        if (!window.go) {
            // Web Mode: Use API URL directly
            if (pkg.hasThumbnail && !pkg.thumbnailBase64) {
                const token = getStoredToken();
                setAsyncThumb(`/api/thumbnail?filePath=${encodeURIComponent(pkg.filePath)}&token=${token || ''}`);
            }
            return;
        }

        // Desktop Mode: Intersection Observer
        if (!pkg.hasThumbnail || thumbSrc) return;

        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                setIsVisible(true);
                observer.disconnect();
            }
        }, { rootMargin: '200px' });

        if (cardRef.current) observer.observe(cardRef.current);
        return () => observer.disconnect();
    }, [pkg.filePath, pkg.hasThumbnail, isListed, thumbSrc]);

    useEffect(() => {
        if (isListed) return;
        if (window.go && isVisible && pkg.hasThumbnail && !thumbSrc) {
            window.go.main.App.GetPackageThumbnail(pkg.filePath)
                .then((b64: string) => {
                    if (b64) setAsyncThumb(`data:image/jpeg;base64,${b64}`);
                })
                .catch((e: any) => console.error('Thumb load failed:', e));
        }
    }, [isVisible, pkg.hasThumbnail, pkg.filePath, isListed, thumbSrc]);

    // ── Click handler ─────────────────────────────────────────────────────────
    const handleClick = (e: React.MouseEvent) => {
        // A long-press already opened the action sheet; suppress the tap's
        // trailing synthetic click so it doesn't also select the card.
        if (longPress.consumeLongPress()) return;

        // Bump this package to the front of the Hard Pass queue on any click.
        if ((isListed || cardState === 'identified') && window.go) {
            // @ts-ignore
            window.go.main.App.PrioritizePackage(pkg.filePath).catch(() => {});
        }
        onSelect(pkg, e);
    };

    const { consumeLongPress, ...longPressHandlers } = longPress;



    // Visual State Logic
    let statusClass = "border-gray-700 opacity-60 grayscale";
    let statusIcon = <Power size={14} className="text-gray-400" />;

    // 1. Resolve Icon (Intrinsic State)
    if (pkg.isCorrupt) {
        statusIcon = <AlertTriangle size={14} className="text-red-500" />;
    } else if (pkg.isEnabled) {
        if (pkg.isExactDuplicate) {
            statusIcon = <Copy size={16} className="text-purple-500" />;
        } else if (pkg.isDuplicate) {
            statusIcon = <AlertTriangle size={16} className="text-yellow-500" />;
        } else if (pkg.missingDeps && pkg.missingDeps.length > 0) {
            statusIcon = <AlertCircle size={16} className="text-red-500" />;
        } else {
            statusIcon = <Check size={16} className="text-green-500" />;
        }
    }

    // 2. Resolve Styling (Interaction State > Intrinsic State)
    if (isAnchor) {
        statusClass = "border-white ring-2 ring-white/50 shadow-2xl z-20 grayscale-0 " + (viewMode === 'grid' ? "scale-[1.05]" : "");
    } else if (isSelected) {
        // Selection overrides Corrupt/Duplicate colors for the border/ring, 
        // ensuring the user knows it is selected.
        statusClass = "border-blue-500 ring-2 ring-blue-500/50 shadow-xl z-10 grayscale-0 " + (viewMode === 'grid' ? "scale-[1.02]" : "");
    } else {
        // Not Selected/Anchor -> Show specific status colors
        if (pkg.isCorrupt) {
            statusClass = "border-red-600 ring-1 ring-red-600/50 shadow-[0_0_15px_rgba(220,38,38,0.4)] z-10 grayscale-0";
        } else if (pkg.isEnabled) {
            statusClass = "border-gray-600 grayscale-0";
            if (pkg.isExactDuplicate) {
                statusClass = "border-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.3)]";
            } else if (pkg.isDuplicate) {
                statusClass = "border-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.3)]";
            } else if (pkg.missingDeps && pkg.missingDeps.length > 0) {
                statusClass = "border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]";
            } else {
                statusClass = "border-green-500/50 hover:border-green-400";
            }
        }
    }

    // Override with Highlight
    if (isHighlighted) {
        // Keep grayscale-0 but set border to base pink (animation modulated alpha)
        statusClass = "border-pink-500 animate-neon-flash shadow-xl z-20 grayscale-0 scale-[1.05]";
    }

    if (isListed) {
        const hasInteractionState = isAnchor || isSelected || isHighlighted;
        return (
            <div
                key={startAnimationTs}
                id={`package-${pkg.filePath}`}
                ref={cardRef}
                onClick={handleClick}
                onContextMenu={(e) => onContextMenu(e, pkg)}
                className="cursor-pointer min-w-0"
                {...longPressHandlers}
            >
                <PackageSkeleton
                    pkg={pkg}
                    viewMode={viewMode}
                    hidePackageNames={hidePackageNames}
                    hideCreatorNames={hideCreatorNames}
                    shimmering={isShimmerVisible}
                    className={hasInteractionState ? statusClass : "border-gray-700"}
                />
            </div>
        );
    }

    if (viewMode === 'list') {
        return (
            <div
                key={startAnimationTs} // Force re-render on new highlight request to restart animation
                id={`package-${pkg.filePath}`}
                ref={cardRef}
                onClick={handleClick}
                onContextMenu={(e) => onContextMenu(e, pkg)}
                className={clsx(
                    "relative group rounded-lg border overflow-hidden cursor-pointer bg-gray-900 transition-colors hover:bg-gray-800 flex items-center h-20 p-2 gap-3",
                    statusClass,
                    revealClassName
                )}
                {...longPressHandlers}
            >
                {/* Small Thumbnail */}
                <div className="h-16 w-16 bg-gray-800 rounded overflow-hidden shrink-0 relative">
                    {pkg.hasThumbnail && thumbSrc && !pkg.isCorrupt ? (
                        <img
                            src={thumbSrc}
                            alt={pkg.fileName}
                            loading="lazy"
                            className={clsx(
                                "w-full h-full object-cover",
                                censorThumbnails && "scale-110", // Scale up to hide blur edges
                                revealClassName
                            )}
                            style={censorThumbnails ? { filter: `blur(${blurAmount}px)` } : undefined}
                        />
                    ) : (
                        <div className={clsx("w-full h-full flex items-center justify-center border", pkg.isCorrupt ? "bg-red-900/40 border-red-500/30 text-red-500" : "text-gray-700 border-gray-700")}>
                            {pkg.isCorrupt ? (
                                <span className="text-[10px] font-bold rotate-[-15deg]">ERROR</span>
                            ) : (
                                <span className="text-[8px] font-bold">{pkg.hasThumbnail ? "..." : "NO IMG"}</span>
                            )}
                        </div>
                    )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-1">
                        <h3 className={clsx("font-bold text-gray-200 text-sm truncate pr-2 transition-opacity", hidePackageNames && "opacity-0 select-none")} title={hidePackageNames ? "" : pkg.fileName}>
                            {pkg.meta.packageName || pkg.fileName}
                        </h3>
                        <div className="flex items-center gap-1.5 shrink-0">
                            <RatingFavoritePopoverBadge pkg={pkg} onRate={onRate} onToggleFavorite={onToggleFavorite} />
                            {statusIcon}
                            <button
                                onClick={(e) => { e.stopPropagation(); onOpenActionSheet(pkg); }}
                                className="md:hidden p-1.5 rounded-full bg-gray-900/80 backdrop-blur-sm border border-gray-700/50 text-gray-300"
                                title="Package actions"
                            >
                                <MoreVertical size={14} />
                            </button>
                        </div>
                    </div>
                    <div className="flex justify-between items-center text-xs text-gray-500">
                        <span className={clsx("truncate transition-opacity", hideCreatorNames && "opacity-0 select-none")}>
                            {pkg.meta.creator || "Unknown"}
                        </span>
                        <div className="flex gap-2">
                            <span>v{pkg.meta.version}</span>
                            <span>{formatBytes(pkg.size)}</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Default Grid View
    return (
        <div
            key={startAnimationTs} // Force re-render on new highlight request to restart animation
            id={`package-${pkg.filePath}`}
            ref={cardRef}
            onClick={handleClick}
            onContextMenu={(e) => onContextMenu(e, pkg)}
            className={clsx(
                "relative group rounded-xl border-2 overflow-hidden cursor-pointer bg-gray-900 aspect-square transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:z-10",
                statusClass,
                revealClassName
            )}
            {...longPressHandlers}
        >
            {/* Full size thumbnail */}
            <div className="absolute inset-0 w-full h-full">
                {pkg.hasThumbnail && thumbSrc && !pkg.isCorrupt ? (
                    <img
                        src={thumbSrc}
                        alt={pkg.fileName}
                        loading="lazy"
                        className={clsx(
                            "w-full h-full object-cover transition-transform duration-500 group-hover:scale-110",
                            censorThumbnails && "scale-125", // Scale up to hide blur edges
                            revealClassName
                        )}
                        style={censorThumbnails ? { filter: `blur(${blurAmount}px)` } : undefined}
                    />
                ) : (
                    <div className={clsx("w-full h-full flex items-center justify-center", pkg.isCorrupt ? "bg-red-900/40" : "bg-gradient-to-br from-gray-800 to-gray-900")}>
                        {pkg.isCorrupt ? (
                            <div className="flex flex-col items-center justify-center text-red-500 font-bold opacity-80 rotate-[-15deg] border-4 border-red-500/50 p-2 rounded-xl">
                                <span className="text-2xl tracking-widest">CORRUPT</span>
                            </div>
                        ) : (
                            <span className="text-4xl font-bold text-gray-700 select-none opacity-50">{pkg.hasThumbnail ? "..." : "VAR"}</span>
                        )}
                    </div>
                )}
            </div>

            {/* Rating/Favourite — top-left corner. Passive pill at rest, only when
                rated/favourited; a click opens the interactive popover (see
                RatingFavoritePopoverBadge above). No hover effect touches this
                corner. */}
            <div className="absolute top-2 left-2 z-10">
                <RatingFavoritePopoverBadge pkg={pkg} onRate={onRate} onToggleFavorite={onToggleFavorite} />
            </div>

            {/* Mobile overflow entry point — not hover-gated (touch has no hover);
                the only way to reach any package action on a phone/tablet, since
                right-click has no touch equivalent. Long-press (see useLongPress
                above) opens the same sheet without the visible affordance. */}
            <button
                onClick={(e) => { e.stopPropagation(); onOpenActionSheet(pkg); }}
                className="md:hidden absolute top-2 right-2 z-10 p-1.5 rounded-full bg-gray-900/80 backdrop-blur-sm border border-gray-700/50 text-gray-300"
                title="Package actions"
            >
                <MoreVertical size={14} />
            </button>

            {/* Gradient Overlay for Text Readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/40 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />

            {/* Content Overlay */}
            <div className="absolute inset-0 p-4 flex flex-col justify-end">
                <div className="flex justify-between items-end gap-2 mb-1">
                    <h3 className={clsx("font-bold text-white leading-tight line-clamp-2 drop-shadow-md text-sm sm:text-base transition-all", hidePackageNames && "opacity-0 select-none")}>
                        {pkg.meta.packageName || pkg.fileName}
                    </h3>
                    {/* Status Icon Indicator */}
                    <div className="bg-gray-900/80 p-1.5 rounded-full backdrop-blur-sm border border-gray-700/50">
                        {statusIcon}
                    </div>
                </div>

                <div className="flex justify-between items-center text-xs text-gray-400 drop-shadow-sm">
                    <span className={clsx("truncate max-w-[70%] transition-opacity", hideCreatorNames && "opacity-0 select-none")}>
                        {pkg.meta.creator || "Unknown"}
                    </span>
                    <span>v{pkg.meta.version || "1"}</span>
                </div>

                {/* Hover Details / Hint */}
                <div className="h-0 group-hover:h-auto overflow-hidden transition-all duration-300">
                    <div className="text-[10px] text-gray-400 mt-2 border-t border-gray-700/50 pt-2 flex justify-between">
                        <span>{formatBytes(pkg.size)}</span>
                        {pkg.isEnabled && pkg.missingDeps && pkg.missingDeps.length > 0 && <span className="text-red-400 font-bold">{pkg.missingDeps.length} Missing</span>}
                        {pkg.isEnabled && pkg.isExactDuplicate && <span className="text-purple-400 font-bold truncate" title={pkg.obsoletedBy || "Duplicate"}>Duplicate</span>}
                        {pkg.isEnabled && !pkg.isExactDuplicate && pkg.isDuplicate && <span className="text-yellow-400 font-bold truncate" title={pkg.obsoletedBy || "Obsolete"}>Obsolete</span>}
                        {!pkg.isEnabled && <span>Disabled</span>}
                    </div>
                    {/* Explicit Reason Line */}
                    {(pkg.obsoletedBy) && (
                        <div className="text-[9px] text-yellow-500/80 px-1 pb-1 truncate border-t border-gray-700/30 mt-1 select-text cursor-text" title={pkg.obsoletedBy}>
                            {pkg.obsoletedBy}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

export default PackageCard;
