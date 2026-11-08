import { RefObject, useEffect, useState } from 'react';

/**
 * Tracks whether the element is on screen. Observation only runs while
 * `enabled`, so idle cards pay nothing. Without IntersectionObserver
 * support the element is treated as visible.
 */
export const useInViewport = (ref: RefObject<Element>, enabled: boolean): boolean => {
    const [inViewport, setInViewport] = useState(false);

    useEffect(() => {
        const element = ref.current;
        if (!enabled || !element) {
            setInViewport(false);
            return;
        }
        if (typeof IntersectionObserver === 'undefined') {
            setInViewport(true);
            return;
        }
        const observer = new IntersectionObserver(([entry]) => setInViewport(entry.isIntersecting));
        observer.observe(element);
        return () => observer.disconnect();
    }, [ref, enabled]);

    return inViewport;
};
