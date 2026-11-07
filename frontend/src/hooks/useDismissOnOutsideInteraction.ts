import { useEffect, useRef } from 'react';

export interface DismissOptions {
    /** Elements whose pointer/scroll events count as "inside" (panel, and trigger if any). */
    insideRefs: React.RefObject<HTMLElement>[];
    onDismiss: () => void;
    /** Listeners are attached only while enabled. Default `true`. */
    enabled?: boolean;
}

const isInside = (insideRefs: React.RefObject<HTMLElement>[], target: Node | null): boolean => {
    if (!target) return false;
    return insideRefs.some(ref => ref.current?.contains(target));
};

/**
 * Single definition of "dismiss this overlay" for every anchored popover
 * (menus, dropdowns): outside mousedown/touchstart, Escape, a real viewport
 * width change, and a scroll outside the overlay's own content all close it.
 *
 * `onDismiss` is read through a ref so listeners attach once per `enabled`
 * toggle, not on every render of a caller that passes an inline arrow.
 */
export const useDismissOnOutsideInteraction = ({ insideRefs, onDismiss, enabled = true }: DismissOptions): void => {
    const onDismissRef = useRef(onDismiss);
    onDismissRef.current = onDismiss;

    useEffect(() => {
        if (!enabled) return;

        const onPointerDown = (e: MouseEvent | TouchEvent) => {
            if (isInside(insideRefs, e.target as Node)) return;
            onDismissRef.current();
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onDismissRef.current();
        };

        // A dropdown anchored to a button in a scroll container detaches on
        // resize; closing is the least surprising behaviour (matches native).
        // But most mobile browsers fire `window.resize` when the virtual
        // keyboard opens/closes (height-only change) — that must NOT close
        // the overlay mid-typing, so only react to an actual width change
        // (real resize/rotation), per #55.
        const widthAtAttach = window.innerWidth;
        const onResize = () => {
            if (window.innerWidth !== widthAtAttach) onDismissRef.current();
        };

        // Capture phase so every scrolling element is observed, including
        // ancestors outside the overlay — but a scroll inside the overlay's
        // own content (e.g. an `overflow-y-auto` option list) must not close
        // it, since that scroll doesn't detach the overlay from anything.
        const onScroll = (e: Event) => {
            if (isInside(insideRefs, e.target as Node)) return;
            onDismissRef.current();
        };

        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('touchstart', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        window.addEventListener('resize', onResize);
        window.addEventListener('scroll', onScroll, true);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('touchstart', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('resize', onResize);
            window.removeEventListener('scroll', onScroll, true);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, ...insideRefs]);
};

export default useDismissOnOutsideInteraction;
