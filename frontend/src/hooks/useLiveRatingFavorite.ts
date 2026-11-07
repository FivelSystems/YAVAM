import { useCallback, useEffect, useState } from 'react';
import { VarPackage } from '../types';

/**
 * Local echo of a package's rating/favourite, for surfaces whose `pkg` is a
 * snapshot captured at open-time (`ContextMenu`, `ActionSheet` both receive
 * `contextMenu.pkg`, a direct reference set once when the menu/sheet opens)
 * rather than a live lookup into the `packages` array — `patchFamily` replaces
 * the package object in state, so the snapshot's own `rating`/`isFavorite`
 * fields go stale the instant it's edited. Resyncs on the data fields
 * themselves (not just `pkg` identity), so repeated edits within the same
 * open menu/sheet stay correct instead of only updating on next open.
 *
 * Surfaces that already read a live object directly (e.g. `PackageCard`, via
 * `CardGrid`'s `currentSlice` over the live `packages` array) don't need this —
 * reading `pkg.rating`/`pkg.isFavorite` straight off the prop is simpler there.
 */
export const useLiveRatingFavorite = (
    pkg: VarPackage | null,
    onSetRating: (pkg: VarPackage, rating: number) => void,
    onSetFavorite: (pkg: VarPackage, favorite: boolean) => void,
) => {
    const [rating, setRating] = useState(pkg?.rating ?? 0);
    const [isFavorite, setIsFavorite] = useState(!!pkg?.isFavorite);

    useEffect(() => {
        setRating(pkg?.rating ?? 0);
        setIsFavorite(!!pkg?.isFavorite);
    }, [pkg?.filePath, pkg?.rating, pkg?.isFavorite]);

    const rate = useCallback((n: number) => {
        if (!pkg) return;
        setRating(n);
        onSetRating(pkg, n);
    }, [pkg, onSetRating]);

    const toggleFavorite = useCallback(() => {
        if (!pkg) return;
        const next = !isFavorite;
        setIsFavorite(next);
        onSetFavorite(pkg, next);
    }, [pkg, isFavorite, onSetFavorite]);

    return { rating, isFavorite, rate, toggleFavorite };
};

export default useLiveRatingFavorite;
