import React, { useEffect, useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, X, Hash } from 'lucide-react';
import { useFilterContext } from '../../../context/FilterContext';
import { usePackageContext } from '../../../context/PackageContext';
import { parseSearchQuery, buildQueryString } from '../../../utils/search';
import { getSuggestions, SearchVocabulary, Suggestion } from '../../../utils/search/suggest';
import { INERT_FIELDS, SearchToken } from '../../../utils/search/types';

interface SearchBarProps {
    /** Rendered at the right edge inside the pill (e.g. the sort control). */
    trailing?: React.ReactNode;
}

const tokenTone = (token: SearchToken): string => {
    if (token.op === 'exclude') return 'bg-red-500/15 text-red-300 border-red-500/30';
    if (INERT_FIELDS.includes(token.field)) return 'bg-gray-600/40 text-gray-400 border-gray-500/30 line-through decoration-gray-500';
    return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
};

/** The whitespace-delimited word currently under the caret (empty after a space). */
const currentChunk = (draft: string): string =>
    draft.endsWith(' ') ? '' : (draft.split(/\s+/).pop() ?? '');

/** Remove the trailing word (and its leading space) from the draft. */
const stripLastChunk = (draft: string): string =>
    draft.replace(/(?:^|\s+)\S*$/, '').replace(/\s+$/, '');

/** True when a word is a complete `field:value` structured token (not free text). */
const isStructuredToken = (chunk: string): boolean => {
    const token = parseSearchQuery(chunk).tokens[0];
    return !!token && token.field !== 'text' && !!token.value;
};

const splitQuery = (query: string): { chips: SearchToken[]; text: string } => {
    const tokens = parseSearchQuery(query).tokens;
    return {
        chips: tokens.filter(t => t.field !== 'text'),
        text: tokens.filter(t => t.field === 'text').map(t => t.raw).join(' '),
    };
};

export const SearchBar: React.FC<SearchBarProps> = ({ trailing }) => {
    const { searchQuery, setSearchQuery, inputRef } = useFilterContext();
    const { packages, availableTags } = usePackageContext();

    // Structured filters live as chips; free text lives in the input, editable.
    const initial = useMemo(() => splitQuery(searchQuery), []); // eslint-disable-line react-hooks/exhaustive-deps
    const [chips, setChips] = useState<SearchToken[]>(initial.chips);
    const [draft, setDraft] = useState(initial.text);
    const [isOpen, setIsOpen] = useState(false);
    const [highlight, setHighlight] = useState(-1);
    const blurTimer = useRef<ReturnType<typeof setTimeout>>();
    const pushedRef = useRef(searchQuery);

    const vocab = useMemo<SearchVocabulary>(() => {
        const creators = Array.from(
            new Set(packages.map(p => p.meta?.creator).filter((c): c is string => !!c)),
        ).sort((a, b) => a.localeCompare(b));

        const typeSet = new Set<string>();
        packages.forEach(p => {
            if (p.categories && p.categories.length > 0) p.categories.forEach(c => typeSet.add(c));
            else if (p.type) typeSet.add(p.type);
        });

        return { creators, types: Array.from(typeSet).sort(), tags: availableTags };
    }, [packages, availableTags]);

    // Publish chips + free text as one query. Free text filters live as typed;
    // structured tokens (chips, or one still in the box) also contribute.
    const publish = (nextChips: SearchToken[], nextDraft: string) => {
        setChips(nextChips);
        setDraft(nextDraft);
        const query = [buildQueryString(nextChips), nextDraft.trim()].filter(Boolean).join(' ');
        pushedRef.current = query;
        setSearchQuery(query);
    };

    // Re-derive local state when the query is changed elsewhere (e.g. Clear all).
    useEffect(() => {
        if (searchQuery === pushedRef.current) return;
        const { chips: c, text } = splitQuery(searchQuery);
        setChips(c);
        setDraft(text);
        pushedRef.current = searchQuery;
    }, [searchQuery]);

    const chunk = currentChunk(draft);
    const suggestions = useMemo(
        () => (isOpen ? getSuggestions(chunk, vocab) : []),
        [isOpen, chunk, vocab],
    );

    const liftToken = (token: SearchToken) => publish([...chips, token], stripLastChunk(draft));

    const applySuggestion = (s: Suggestion) => {
        const head = stripLastChunk(draft);
        // A field completion (`creator:`) keeps the caret so a value can follow.
        if (s.insertText.endsWith(':')) {
            publish(chips, (head ? `${head} ` : '') + s.insertText);
            setHighlight(-1);
            inputRef.current?.focus();
            return;
        }
        const token = parseSearchQuery(s.insertText).tokens[0];
        if (token) liftToken(token);
        setHighlight(-1);
        inputRef.current?.focus();
    };

    const removeChip = (index: number) => publish(chips.filter((_, i) => i !== index), draft);

    const clearAll = () => {
        publish([], '');
        inputRef.current?.focus();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const active = suggestions.length > 0 && isOpen;

        if (e.key === 'ArrowDown' && active) {
            e.preventDefault();
            setHighlight(h => Math.min(h + 1, suggestions.length - 1));
            return;
        }
        if (e.key === 'ArrowUp' && active) {
            e.preventDefault();
            setHighlight(h => Math.max(h - 1, 0));
            return;
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            if (active && highlight >= 0 && suggestions[highlight]) {
                applySuggestion(suggestions[highlight]);
                return;
            }
            // Nothing chosen: promote a completed field token, else just accept
            // the free text (it already filters) and close the dropdown.
            if (isStructuredToken(chunk)) liftToken(parseSearchQuery(chunk).tokens[0]);
            setIsOpen(false);
            return;
        }
        if (e.key === 'Escape') {
            if (isOpen) setIsOpen(false);
            else if (draft) publish(chips, '');
            return;
        }
        // Space chips a completed field token; between words it is a normal space.
        if (e.key === ' ') {
            const quotesBalanced = (draft.match(/"/g)?.length ?? 0) % 2 === 0;
            if (quotesBalanced && isStructuredToken(chunk)) {
                e.preventDefault();
                liftToken(parseSearchQuery(chunk).tokens[0]);
                setHighlight(-1);
            }
            return;
        }
        if (e.key === 'Backspace' && draft === '' && chips.length > 0) {
            e.preventDefault();
            publish(chips.slice(0, -1), '');
        }
    };

    return (
        <div className="relative w-full md:max-w-2xl">
            <div className="flex items-center gap-2 bg-gray-700 px-3 py-2 rounded-lg">
                <Search size={18} className="text-gray-400 shrink-0" />

                <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
                    {chips.map((token, i) => (
                        <span
                            key={`${token.raw}-${i}`}
                            className={clsx(
                                'inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-md border text-xs font-medium max-w-full',
                                tokenTone(token),
                            )}
                            title={INERT_FIELDS.includes(token.field) ? `${token.field}: has no data yet` : token.raw}
                        >
                            <span className="truncate">{token.raw}</span>
                            <button
                                type="button"
                                onClick={() => removeChip(i)}
                                className="shrink-0 rounded hover:bg-black/20 p-0.5"
                                aria-label={`Remove ${token.raw}`}
                            >
                                <X size={12} />
                            </button>
                        </span>
                    ))}

                    <input
                        id="search-input"
                        ref={inputRef}
                        className="bg-transparent outline-none text-sm placeholder-gray-500 text-gray-200 flex-1 min-w-[8rem] py-0.5"
                        placeholder={chips.length ? 'Search text…  or add a filter' : 'Search…  try creator:  tag:  -status:corrupt'}
                        value={draft}
                        onChange={e => { publish(chips, e.target.value); setHighlight(-1); setIsOpen(true); }}
                        onFocus={() => { clearTimeout(blurTimer.current); setIsOpen(true); }}
                        onBlur={() => { blurTimer.current = setTimeout(() => setIsOpen(false), 150); }}
                        onKeyDown={handleKeyDown}
                        autoComplete="off"
                        spellCheck={false}
                    />
                </div>

                {(chips.length > 0 || draft) && (
                    <button
                        type="button"
                        onClick={clearAll}
                        className="p-1 rounded text-gray-500 hover:text-white transition-colors shrink-0"
                        title="Clear search"
                    >
                        <X size={15} />
                    </button>
                )}

                {trailing && <div className="shrink-0">{trailing}</div>}
            </div>

            <AnimatePresence>
                {isOpen && suggestions.length > 0 && (
                    <motion.ul
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.12 }}
                        className="absolute left-0 right-0 top-full mt-2 z-50 max-h-72 overflow-y-auto bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 custom-scrollbar"
                    >
                        {suggestions.map((s, i) => (
                            <li key={`${s.insertText}-${i}`}>
                                <button
                                    type="button"
                                    // Keep focus on the input so onBlur doesn't close before the click lands.
                                    onMouseDown={e => e.preventDefault()}
                                    onClick={() => applySuggestion(s)}
                                    onMouseEnter={() => setHighlight(i)}
                                    className={clsx(
                                        'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors',
                                        i === highlight ? 'bg-blue-600/20 text-blue-200' : 'text-gray-300 hover:bg-gray-700',
                                    )}
                                >
                                    {s.kind === 'field'
                                        ? <Search size={13} className="text-gray-500 shrink-0" />
                                        : <Hash size={13} className="text-gray-500 shrink-0" />}
                                    <span className="truncate">{s.label}</span>
                                    {s.detail && <span className="ml-auto text-xs text-gray-500 shrink-0">{s.detail}</span>}
                                </button>
                            </li>
                        ))}
                    </motion.ul>
                )}
            </AnimatePresence>
        </div>
    );
};
