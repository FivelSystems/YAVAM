import { createContext, useContext, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { useDismissOnOutsideInteraction } from '../../hooks/useDismissOnOutsideInteraction';

/** Minimum gap kept between the menu and every viewport edge. */
const EDGE_INSET_PX = 10;

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), Math.max(min, max));

interface AnchoredMenuProps {
    /** Point the menu opens at — the click/long-press position. Callers mount
     * `AnchoredMenu` only while open; there is no "mounted but closed" state. */
    anchor: { x: number; y: number };
    onClose: () => void;
    children: React.ReactNode;
    /** Width stays caller-defined (56 vs 40 Tailwind units today). */
    className?: string;
    /** `dialog` for popovers holding form controls; `menu` (default) for item lists. */
    role?: 'menu' | 'dialog';
    ariaLabel?: string;
}

const MenuCloseContext = createContext<() => void>(() => {});

/**
 * Shell-only primitive for a point-anchored popover: measures itself, flips
 * to the side with room (falling back to a viewport-clamped position),
 * portals to `document.body`, and dismisses itself via
 * {@link useDismissOnOutsideInteraction}. Knows nothing about menu content —
 * `ContextMenu` and `SidebarGroupMenu` compose {@link MenuItem} and
 * {@link MenuDivider} as children.
 */
export const AnchoredMenu = ({ anchor, onClose, children, className, role = 'menu', ariaLabel }: AnchoredMenuProps) => {
    const ref = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ top: anchor.y, left: anchor.x });
    const [maxHeight, setMaxHeight] = useState(() => window.innerHeight - 2 * EDGE_INSET_PX);

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;

        const rect = el.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Flip first — open to the side that has room, matching native context
        // menus — then clamp into the viewport so an oversized menu never
        // reports a negative position.
        let left = anchor.x + rect.width > viewportWidth ? anchor.x - rect.width : anchor.x;
        let top = anchor.y + rect.height > viewportHeight ? anchor.y - rect.height : anchor.y;

        left = clamp(left, EDGE_INSET_PX, viewportWidth - rect.width - EDGE_INSET_PX);
        top = clamp(top, EDGE_INSET_PX, viewportHeight - rect.height - EDGE_INSET_PX);

        setPosition({ top, left });
        setMaxHeight(viewportHeight - 2 * EDGE_INSET_PX);
    }, [anchor.x, anchor.y]);

    useDismissOnOutsideInteraction({ insideRefs: [ref], onDismiss: onClose });

    return createPortal(
        <MenuCloseContext.Provider value={onClose}>
            <div
                ref={ref}
                role={role}
                aria-label={ariaLabel}
                className={clsx('fixed z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 text-sm overflow-y-auto', className)}
                style={{ top: position.top, left: position.left, maxHeight }}
            >
                {children}
            </div>
        </MenuCloseContext.Provider>,
        document.body,
    );
};

interface MenuItemProps {
    icon?: React.ReactNode;
    tone?: 'default' | 'danger';
    onSelect: () => void;
    children: React.ReactNode;
}

/**
 * A selectable row. Reads the enclosing menu's close function from context so
 * every caller gets "select closes the menu, then runs the action" for free,
 * instead of repeating `onSelect(); onClose();` at each call site. Closing
 * first matches the existing "Delete All Corrupt" behaviour (close before a
 * confirmation modal opens) and avoids the menu lingering under it.
 */
export const MenuItem = ({ icon, tone = 'default', onSelect, children }: MenuItemProps) => {
    const close = useContext(MenuCloseContext);
    return (
        <button
            role="menuitem"
            onClick={() => { close(); onSelect(); }}
            className={clsx(
                'w-full text-left px-3 py-2 flex items-center gap-2',
                tone === 'danger' ? 'hover:bg-red-500/20 text-red-400 hover:text-red-300' : 'hover:bg-gray-700 text-white',
            )}
        >
            {icon}
            {children}
        </button>
    );
};

export const MenuDivider = () => <div role="separator" className="border-t border-gray-700 my-1" />;

export default AnchoredMenu;
