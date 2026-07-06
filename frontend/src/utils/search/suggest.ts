import { TokenField } from './types';

/** Vocabulary drawn from the loaded packages, used to suggest concrete values. */
export interface SearchVocabulary {
    creators: string[];
    types: string[];
    tags: string[];
}

export interface Suggestion {
    /** `field` completes a `field:` prefix; `value` completes a whole token. */
    kind: 'field' | 'value';
    field: TokenField;
    /** Text shown in the dropdown row. */
    label: string;
    /** Secondary hint shown dimmed (field description or match count). */
    detail?: string;
    /** The chunk to place in the input. If it ends with `:` the caret stays for a value. */
    insertText: string;
}

/** Fields backed by real data today, shown in suggestions. */
export const SEARCHABLE_FIELDS: { field: TokenField; hint: string }[] = [
    { field: 'creator', hint: 'filter by creator' },
    { field: 'type', hint: 'scene, look, clothing…' },
    { field: 'tag', hint: 'filter by tag' },
    { field: 'status', hint: 'enabled, disabled, missing, corrupt…' },
    { field: 'size', hint: '>100mb, 10mb..1gb' },
];

const STATUS_VALUES = ['enabled', 'disabled', 'missing', 'corrupt', 'duplicate', 'orphan'];
const SIZE_TEMPLATES = ['>100mb', '<50mb', '10mb..100mb', '>1gb'];

const quoteIfNeeded = (value: string): string => (/\s/.test(value) ? `"${value}"` : value);

const splitOperator = (draft: string): { prefix: string; body: string } => {
    if (draft.startsWith('+') || draft.startsWith('-')) {
        return { prefix: draft[0], body: draft.slice(1) };
    }
    return { prefix: '', body: draft };
};

const valuePool = (field: TokenField, vocab: SearchVocabulary): string[] | null => {
    switch (field) {
        case 'creator': return vocab.creators;
        case 'type': return vocab.types;
        case 'tag': return vocab.tags;
        case 'status': return STATUS_VALUES;
        case 'size': return SIZE_TEMPLATES;
        default: return null;
    }
};

/**
 * Produce autocomplete suggestions for the token currently being typed.
 * `draft` is the uncommitted chunk only (one token, optionally `+`/`-` prefixed).
 */
export const getSuggestions = (
    draft: string,
    vocab: SearchVocabulary,
    limit = 8,
): Suggestion[] => {
    const { prefix, body } = splitOperator(draft);
    const colon = body.indexOf(':');

    // Typing a value for an explicit field → suggest matching values.
    if (colon > 0) {
        const field = body.slice(0, colon).toLowerCase() as TokenField;
        const valuePart = body.slice(colon + 1).toLowerCase();
        const pool = valuePool(field, vocab);
        if (!pool) return [];
        return pool
            .filter(v => v.toLowerCase().includes(valuePart))
            .slice(0, limit)
            .map(v => ({
                kind: 'value',
                field,
                label: v,
                insertText: `${prefix}${field}:${quoteIfNeeded(v)}`,
            }));
    }

    const term = body.toLowerCase();

    // Field-name completions (`cr` → `creator:`).
    const fields: Suggestion[] = SEARCHABLE_FIELDS
        .filter(f => !term || f.field.startsWith(term))
        .map(f => ({
            kind: 'field',
            field: f.field,
            label: `${f.field}:`,
            detail: f.hint,
            insertText: `${prefix}${f.field}:`,
        }));

    // Direct value matches so typing a bare word surfaces `creator:Name`,
    // `type:scene`, or `tag:name` without having to type the field first.
    const values: Suggestion[] = [];
    if (term) {
        const direct: { field: TokenField; pool: string[] }[] = [
            { field: 'creator', pool: vocab.creators },
            { field: 'type', pool: vocab.types },
            { field: 'tag', pool: vocab.tags },
        ];
        for (const { field, pool } of direct) {
            for (const v of pool) {
                if (v.toLowerCase().includes(term)) {
                    values.push({ kind: 'value', field, label: v, detail: field, insertText: `${prefix}${field}:${quoteIfNeeded(v)}` });
                }
            }
        }
    }

    return [...fields, ...values].slice(0, limit);
};
