import clsx from 'clsx';
import { Heart } from 'lucide-react';
import { RatingStars } from './RatingStars';

export interface RatingFavoriteControlProps {
    /** Current rating, 0–5 (0 = unrated). Pass the live package field, not a snapshot. */
    rating: number;
    isFavorite: boolean;
    /** Receives the resolved target rating — this component already applies the
     * "click the active star to clear" rule, so callers just persist what they're given. */
    onRate: (n: number) => void;
    onToggleFavorite: () => void;
    /** Passed through to RatingStars; the heart matches via size+2. */
    size?: number;
    /** 'row': stars + heart with a comfortable gap, for menus/sheets.
     *  'compact': tighter gap, for the card's hover overlay. */
    layout?: 'row' | 'compact';
}

/**
 * Shared rating + favourite editor — the star row plus heart toggle used by
 * the context menu, the details panel, the card's hover overlay, and the
 * mobile action sheet. Previously duplicated inline at each of those sites.
 */
export const RatingFavoriteControl = ({ rating, isFavorite, onRate, onToggleFavorite, size = 16, layout = 'row' }: RatingFavoriteControlProps) => {
    const rate = (n: number) => onRate(n === rating ? 0 : n);

    return (
        <div className={clsx('flex items-center', layout === 'compact' ? 'gap-0.5' : 'gap-1.5')}>
            <RatingStars value={rating} onChange={rate} size={size} gapClassName={layout === 'compact' ? 'gap-0.5' : 'gap-1'} />
            <button
                onClick={onToggleFavorite}
                className={clsx('p-0.5 transition-colors', isFavorite ? 'text-pink-400' : 'text-gray-500 hover:text-pink-400')}
                title={isFavorite ? 'Remove from favourites' : 'Add to favourites'}
            >
                <Heart size={size + 2} className={clsx(isFavorite && 'fill-pink-400')} />
            </button>
        </div>
    );
};

export default RatingFavoriteControl;
