import { useState } from 'react';
import { Star } from 'lucide-react';
import clsx from 'clsx';

interface RatingStarsProps {
    /** Current rating, 0-5. 0 means unrated. */
    value: number;
    /** Receives the clicked star's value (1-5). Click-the-active-star-to-clear is
     * the caller's responsibility (sidebar/menu both already resolve that), so this
     * always reports the raw star number. */
    onChange: (n: number) => void;
    /** Star icon size in px. Sidebar uses a slightly larger size than menus. */
    size?: number;
    /** Shows a trailing "clear" text link when a rating is set. */
    showClearButton?: boolean;
    /** Gap between stars — Tailwind gap class. */
    gapClassName?: string;
}

/**
 * Shared 5-star rating control: hovering previews the star count, clicking commits
 * it. Used by both the sidebar's Rating filter and the right-click menu's
 * rate-this-package row — previously two near-identical components.
 */
export const RatingStars = ({ value, onChange, size = 18, showClearButton = false, gapClassName = 'gap-1' }: RatingStarsProps) => {
    const [hover, setHover] = useState(0);
    const shown = hover || value;
    return (
        <div className={clsx('flex items-center', gapClassName)} onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map(n => (
                <button
                    key={n}
                    onClick={() => onChange(n)}
                    onMouseEnter={() => setHover(n)}
                    className="p-0.5 text-gray-500 hover:text-yellow-400 transition-colors"
                    title={`Rate ${n} star${n > 1 ? 's' : ''}`}
                >
                    <Star size={size} className={clsx(n <= shown ? "fill-yellow-400 text-yellow-400" : "fill-transparent")} />
                </button>
            ))}
            {showClearButton && value > 0 && (
                <button onClick={() => onChange(0)} className="ml-1 text-[10px] text-gray-500 hover:text-white">clear</button>
            )}
        </div>
    );
};

export default RatingStars;
