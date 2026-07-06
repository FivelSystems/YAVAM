import React, { useMemo, useRef, useState } from 'react';
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
    if (token.field === 'text') return 'bg-gray-600/50 text-gray-200 border-gray-500/40';
    return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
};

export const SearchBar: React.FC<SearchBarProps> = ({ trailing }) => {
    const { searchQuery, setSearchQuery, inputRef } = useFilterContext();
    const { packages, availableTags } = usePackageContext();

    const [draft, setDraft] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [highlight, setHighlight] = useState(0);
    const blurTimer = useRef<ReturnType<typeof setTimeout>>();

    const tokens = useMemo(() => parseSearchQuery(searchQuery).tokens, [searchQuery]);

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

    const suggestions = useMemo(
        () => (isOpen ? getSuggestions(draft, vocab) : []),
        [isOpen, draft, vocab],
    );

    // Every write floats free-text words to the end (buildQueryString), so the
    // query reads `field:… field:… [text text]` regardless of typing order.
    const setTokens = (next: SearchToken[]) => setSearchQuery(buildQueryString(next));

    const commitChunk = (chunk: string) => {
        const trimmed = chunk.trim();
        if (!trimmed) return;
        const combined = [searchQuery, trimmed].filter(Boolean).join(' ');
        setSearchQuery(buildQueryString(parseSearchQuery(combined).tokens));
        setDraft('');
        setHighlight(0);
    };

    const applySuggestion = (s: Suggestion) => {
        // A field completion (`creator:`) keeps the caret so a value can follow.
        if (s.insertText.endsWith(':')) {
            setDraft(s.insertText);
            setHighlight(0);
            inputRef.current?.focus();
            return;
        }
        commitChunk(s.insertText);
    };

    const removeToken = (index: number) => setTokens(tokens.filter((_, i) => i !== index));

    const clearAll = () => {
        setSearchQuery('');
        setDraft('');
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
            if (active && suggestions[highlight]) applySuggestion(suggestions[highlight]);
            else commitChunk(draft);
            return;
        }
        if (e.key === 'Escape') {
            if (isOpen) setIsOpen(false);
            else if (draft) setDraft('');
            return;
        }
        // Space commits the draft as a token, unless inside a quote or mid-`field:`.
        if (e.key === ' ') {
            const quotesBalanced = (draft.match(/"/g)?.length ?? 0) % 2 === 0;
            if (draft.trim() && quotesBalanced && !draft.endsWith(':')) {
                e.preventDefault();
                commitChunk(draft);
            }
            return;
        }
        if (e.key === 'Backspace' && draft === '' && tokens.length > 0) {
            e.preventDefault();
            removeToken(tokens.length - 1);
        }
    };

    return (
        <div className="relative w-full md:max-w-2xl">
            <div className="flex items-center gap-2 bg-gray-700 px-3 py-2 rounded-lg">
                <Search size={18} className="text-gray-400 shrink-0" />

                <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
                    {tokens.map((token, i) => (
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
                                onClick={() => removeToken(i)}
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
                        placeholder={tokens.length ? 'Add filter…' : 'Search…  try creator:  tag:  -status:corrupt'}
                        value={draft}
                        onChange={e => { setDraft(e.target.value); setHighlight(0); setIsOpen(true); }}
                        onFocus={() => { clearTimeout(blurTimer.current); setIsOpen(true); }}
                        onBlur={() => { blurTimer.current = setTimeout(() => setIsOpen(false), 150); }}
                        onKeyDown={handleKeyDown}
                        autoComplete="off"
                        spellCheck={false}
                    />
                </div>

                {(tokens.length > 0 || draft) && (
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
