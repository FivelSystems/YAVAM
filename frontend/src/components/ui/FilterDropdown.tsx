import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Search } from 'lucide-react';
import clsx from 'clsx';

/** A single selectable value inside a {@link FilterDropdown}. */
export interface FilterOption {
    value: string;
    label: string;
    count?: number;
    /** Tints the count badge to flag a value that needs attention. */
    tone?: 'normal' | 'warning' | 'error';
}

interface FilterDropdownProps {
    label: string;
    icon?: React.ReactNode;
    options: FilterOption[];
    /** True when this value's token is present in the query. */
    isSelected: (value: string) => boolean;
    /** Toggle a value on/off (matches the tokenised search: same field ORs). */
    onToggle: (value: string) => void;
    /** Show the built-in filter box (folds the old bespoke creator search in). */
    searchable?: boolean;
    searchPlaceholder?: string;
    /** Right-click a row → group actions, delegated to the caller's menu. */
    onOptionContextMenu?: (value: string, e: React.MouseEvent) => void;
    emptyHint?: string;
}

const badgeTone = (tone: FilterOption['tone'], selected: boolean): string => {
    if (tone === 'warning') return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    if (tone === 'error') return 'bg-red-500/20 text-red-400 border-red-500/30';
    return selected
        ? 'bg-blue-500/20 text-blue-300 border-transparent'
        : 'bg-gray-900/60 text-gray-400 border-transparent';
};

/**
 * A single reusable filter control: a button that overlays a searchable,
 * multi-select popover. The popover is portalled to the document body and
 * positioned against the trigger, so opening it never reflows the sidebar.
 * Status, Creators, and Categories are three configurations of this one core.
 */
export const FilterDropdown = ({
    label, icon, options, isSelected, onToggle,
    searchable = false, searchPlaceholder = 'Filter…',
    onOptionContextMenu, emptyHint = 'No matches',
}: FilterDropdownProps) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    const selectedLabels = useMemo(
        () => options.filter(o => isSelected(o.value)).map(o => o.label),
        [options, isSelected],
    );
    const selectedCount = selectedLabels.length;
    // Surface the actual picks, not just a tally: one or two fit inline, more
    // collapse to "first, +N" so the trigger stays one line in a narrow sidebar.
    const summary = selectedCount <= 2
        ? selectedLabels.join(', ')
        : `${selectedLabels[0]}, +${selectedCount - 1}`;

    const visible = useMemo(() => {
        if (!search) return options;
        const q = search.toLowerCase();
        return options.filter(o => o.label.toLowerCase().includes(q));
    }, [options, search]);

    const place = () => {
        const trigger = triggerRef.current;
        if (!trigger) return;
        const rect = trigger.getBoundingClientRect();
        const gap = 6;
        const below = window.innerHeight - rect.bottom - gap;
        const above = rect.top - gap;
        const openUp = below < 240 && above > below;
        const maxHeight = Math.max(160, Math.min(360, (openUp ? above : below) - 8));
        setPos({
            top: openUp ? Math.max(8, rect.top - gap) : rect.bottom + gap,
            left: rect.left,
            width: rect.width,
            maxHeight,
        });
    };

    useLayoutEffect(() => {
        if (open) place();
    }, [open]);

    useEffect(() => {
        if (!open) return;
        if (searchable) searchRef.current?.focus();

        const onDocMouseDown = (e: MouseEvent) => {
            const t = e.target as Node;
            if (popoverRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
            setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        // A dropdown anchored to a button in a scroll container detaches on
        // scroll; closing is the least surprising behaviour (matches native).
        const onScrollOrResize = () => setOpen(false);

        document.addEventListener('mousedown', onDocMouseDown);
        document.addEventListener('keydown', onKey);
        window.addEventListener('resize', onScrollOrResize);
        window.addEventListener('scroll', onScrollOrResize, true);
        return () => {
            document.removeEventListener('mousedown', onDocMouseDown);
            document.removeEventListener('keydown', onKey);
            window.removeEventListener('resize', onScrollOrResize);
            window.removeEventListener('scroll', onScrollOrResize, true);
        };
    }, [open, searchable]);

    const toggle = () => {
        if (open) { setOpen(false); return; }
        setSearch('');
        setOpen(true);
    };

    return (
        <>
            <button
                ref={triggerRef}
                onClick={toggle}
                className={clsx(
                    'w-full flex items-center gap-2 px-3 py-2 rounded-md border transition-colors text-sm',
                    open || selectedCount > 0
                        ? 'bg-blue-600/10 border-blue-600/30 text-blue-300'
                        : 'bg-gray-900/40 border-gray-700 text-gray-300 hover:bg-gray-700/60 hover:text-white',
                )}
            >
                {icon && <span className="shrink-0 text-gray-400">{icon}</span>}
                {selectedCount > 0 ? (
                    <span className="flex-1 min-w-0 text-left" title={selectedLabels.join(', ')}>
                        <span className="block text-[10px] uppercase tracking-wide leading-none text-blue-300/60">{label}</span>
                        <span className="block truncate font-medium leading-tight">{summary}</span>
                    </span>
                ) : (
                    <span className="flex-1 text-left truncate font-medium">{label}</span>
                )}
                <ChevronDown size={16} className={clsx('shrink-0 transition-transform text-gray-500', open && 'rotate-180')} />
            </button>

            {open && pos && createPortal(
                <div
                    ref={popoverRef}
                    className="fixed z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-2xl py-1 flex flex-col animate-fade-in"
                    style={{ top: pos.top, left: pos.left, width: Math.max(pos.width, 220), maxHeight: pos.maxHeight }}
                >
                    {searchable && (
                        <div className="px-2 pt-1 pb-2 shrink-0">
                            <div className="flex items-center gap-2 bg-gray-900 border border-gray-700 rounded px-2 py-1.5 focus-within:border-blue-500/60">
                                <Search size={13} className="text-gray-500 shrink-0" />
                                <input
                                    ref={searchRef}
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder={searchPlaceholder}
                                    className="bg-transparent outline-none text-xs text-gray-200 placeholder-gray-600 flex-1 min-w-0"
                                    spellCheck={false}
                                    autoComplete="off"
                                />
                            </div>
                        </div>
                    )}

                    <div className="overflow-y-auto custom-scrollbar px-1">
                        {visible.length === 0 ? (
                            <div className="px-3 py-4 text-center text-xs text-gray-600">{emptyHint}</div>
                        ) : (
                            visible.map(opt => {
                                const selected = isSelected(opt.value);
                                return (
                                    <button
                                        key={opt.value}
                                        onClick={() => onToggle(opt.value)}
                                        onContextMenu={onOptionContextMenu ? (e) => { onOptionContextMenu(opt.value, e); setOpen(false); } : undefined}
                                        className={clsx(
                                            'w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-sm transition-colors',
                                            selected ? 'bg-blue-600/15 text-blue-300' : 'text-gray-300 hover:bg-gray-700/70 hover:text-white',
                                        )}
                                    >
                                        <span className={clsx(
                                            'w-4 h-4 rounded border flex items-center justify-center shrink-0',
                                            selected ? 'bg-blue-500 border-blue-500' : 'border-gray-600',
                                        )}>
                                            {selected && <Check size={12} className="text-white" />}
                                        </span>
                                        <span className="flex-1 text-left truncate">{opt.label}</span>
                                        {opt.count !== undefined && (
                                            <span className={clsx(
                                                'text-[10px] px-1.5 py-0.5 rounded-full border shrink-0',
                                                badgeTone(opt.tone, selected),
                                            )}>
                                                {opt.count}
                                            </span>
                                        )}
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
};

export default FilterDropdown;
