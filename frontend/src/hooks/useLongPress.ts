import { useCallback, useRef } from 'react';

interface UseLongPressOptions {
    /** Hold duration before onLongPress fires. */
    thresholdMs?: number;
    /** Pointer movement, in px, that cancels the pending press — guards against
     * a touch scroll/drag on the card accidentally firing it. */
    moveTolerancePx?: number;
}

interface LongPressHandlers {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerLeave: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
    /** Call from the element's own onClick, first thing: returns true (and
     * resets) if a long-press just fired, so the tap's trailing synthetic
     * click doesn't also run the element's normal click action (e.g. select)
     * right after the long-press action already opened something. */
    consumeLongPress: () => boolean;
}

/**
 * Touch-only press-and-hold gesture — the mobile equivalent of right-click.
 * Built on Pointer Events (not Touch Events) so it composes uniformly with
 * mouse handlers already on the same element, and explicitly ignores
 * non-touch pointers so it never fights a native contextmenu (right-click)
 * handler wired to the same element.
 */
export const useLongPress = (onLongPress: () => void, options: UseLongPressOptions = {}): LongPressHandlers => {
    const { thresholdMs = 500, moveTolerancePx = 10 } = options;
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const startRef = useRef<{ x: number; y: number } | null>(null);
    const firedRef = useRef(false);

    const clear = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        startRef.current = null;
    }, []);

    const onPointerDown = useCallback((e: React.PointerEvent) => {
        if (e.pointerType !== 'touch') return;
        startRef.current = { x: e.clientX, y: e.clientY };
        timerRef.current = setTimeout(() => {
            firedRef.current = true;
            timerRef.current = null;
            onLongPress();
        }, thresholdMs);
    }, [onLongPress, thresholdMs]);

    const onPointerMove = useCallback((e: React.PointerEvent) => {
        if (e.pointerType !== 'touch' || !startRef.current) return;
        const dx = e.clientX - startRef.current.x;
        const dy = e.clientY - startRef.current.y;
        if (Math.sqrt(dx * dx + dy * dy) > moveTolerancePx) clear();
    }, [clear, moveTolerancePx]);

    const onPointerUp = useCallback((e: React.PointerEvent) => {
        if (e.pointerType !== 'touch') return;
        clear();
    }, [clear]);

    const onPointerLeave = useCallback(() => clear(), [clear]);
    const onPointerCancel = useCallback(() => clear(), [clear]);

    const consumeLongPress = useCallback(() => {
        if (!firedRef.current) return false;
        firedRef.current = false;
        return true;
    }, []);

    return { onPointerDown, onPointerUp, onPointerMove, onPointerLeave, onPointerCancel, consumeLongPress };
};

export default useLongPress;
