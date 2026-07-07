import { parseSearchQuery, buildQueryString } from './parse';
import { TokenField } from './types';

/**
 * Query-string editing helpers shared by the searchbar chips and the sidebar,
 * so both compose the *same* tokenised query instead of parallel filter state.
 * Each function takes and returns a raw query string; combining semantics stay
 * in the matcher (same field ORs, different fields AND).
 */

const quoteIfNeeded = (value: string): string => (/\s/.test(value) ? `"${value}"` : value);

const formatChunk = (field: TokenField, value: string): string =>
    `${field}:${quoteIfNeeded(value)}`;

/** True when a `require` token for this field/value is present (case-insensitive). */
export const hasToken = (query: string, field: TokenField, value: string): boolean =>
    parseSearchQuery(query).tokens.some(
        t => t.op === 'require' && t.field === field && t.value === value.toLowerCase(),
    );

/** True when any `require` token addresses this field. */
export const hasField = (query: string, field: TokenField): boolean =>
    parseSearchQuery(query).tokens.some(t => t.op === 'require' && t.field === field);

export const addToken = (query: string, field: TokenField, value: string): string => {
    if (hasToken(query, field, value)) return query;
    const tokens = [
        ...parseSearchQuery(query).tokens,
        ...parseSearchQuery(formatChunk(field, value)).tokens,
    ];
    return buildQueryString(tokens);
};

export const removeToken = (query: string, field: TokenField, value: string): string => {
    const tokens = parseSearchQuery(query).tokens.filter(
        t => !(t.op === 'require' && t.field === field && t.value === value.toLowerCase()),
    );
    return buildQueryString(tokens);
};

/** Add the token if absent, remove it if present — the click behaviour of a facet. */
export const toggleToken = (query: string, field: TokenField, value: string): string =>
    hasToken(query, field, value)
        ? removeToken(query, field, value)
        : addToken(query, field, value);

/** Drop every `require` token of a field (e.g. "All Packages" clearing `status:`). */
export const clearField = (query: string, field: TokenField): string =>
    buildQueryString(
        parseSearchQuery(query).tokens.filter(t => !(t.op === 'require' && t.field === field)),
    );
