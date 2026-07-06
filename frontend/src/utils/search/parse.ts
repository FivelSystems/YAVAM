import { ParsedQuery, SearchToken, TokenField, TokenOp } from './types';

const KNOWN_FIELDS: readonly TokenField[] = [
    'status', 'creator', 'type', 'tag', 'size', 'rating', 'favorite', 'license',
];

/**
 * Split a raw query into whitespace-separated chunks, keeping quoted spans
 * (`tag:"long dress"` or `"red hair"`) intact so values may contain spaces.
 */
const splitChunks = (input: string): string[] => {
    const chunks: string[] = [];
    let current = '';
    let inQuotes = false;

    for (const char of input) {
        if (char === '"') {
            inQuotes = !inQuotes;
            continue;
        }
        if (!inQuotes && /\s/.test(char)) {
            if (current) chunks.push(current);
            current = '';
            continue;
        }
        current += char;
    }
    if (current) chunks.push(current);
    return chunks;
};

const parseChunk = (chunk: string): SearchToken | null => {
    let op: TokenOp = 'require';
    let body = chunk;

    if (body.startsWith('-')) {
        op = 'exclude';
        body = body.slice(1);
    } else if (body.startsWith('+')) {
        op = 'require';
        body = body.slice(1);
    }

    if (!body) return null;

    const colon = body.indexOf(':');
    if (colon > 0) {
        const maybeField = body.slice(0, colon).toLowerCase();
        if ((KNOWN_FIELDS as readonly string[]).includes(maybeField)) {
            const value = body.slice(colon + 1).trim();
            if (!value) return null;
            return { field: maybeField as TokenField, op, value: value.toLowerCase(), raw: chunk };
        }
    }

    // No recognised `field:` prefix → free-text bareword.
    return { field: 'text', op, value: body.toLowerCase(), raw: chunk };
};

/**
 * Parse a tokenised query string into typed tokens. Combining semantics are
 * applied later by the matcher (see match.ts): same-field `require` tokens OR
 * together, different fields AND, and `exclude` tokens drop matches.
 */
export const parseSearchQuery = (input: string): ParsedQuery => {
    if (!input || !input.trim()) return { tokens: [] };
    const tokens = splitChunks(input.trim())
        .map(parseChunk)
        .filter((t): t is SearchToken => t !== null);
    return { tokens };
};

/**
 * Serialise tokens back to a query string, keeping field tokens in their
 * relative order and floating all free-text words to the end as one group
 * (e.g. `type:x red creator:y dress` → `type:x creator:y red dress`).
 */
export const buildQueryString = (tokens: SearchToken[]): string => {
    const fields = tokens.filter(t => t.field !== 'text');
    const texts = tokens.filter(t => t.field === 'text');
    return [...fields, ...texts].map(t => t.raw).join(' ');
};
