import { VarPackage } from '../../types';

/**
 * How a token participates in the query.
 * - `require`  → contributes to its type's OR-group (the group must match).
 * - `exclude`  → the package is dropped if the token matches (`-token`).
 * The leading `+` operator is an explicit marker for `require`; it reads as
 * "at least one of this group must match", which is already how same-type
 * tokens combine, so it resolves to the same participation.
 */
export type TokenOp = 'require' | 'exclude';

/**
 * Every field a token can address. `text` is a bareword (no `field:` prefix)
 * matched as a substring against name/creator/package name.
 *
 * `rating`, `favorite`, and `license` are recognised by the grammar but have no
 * backing data until the Ratings/Favourites capability lands; the matcher treats
 * them as inert (see design/search-syntax.md).
 */
export type TokenField =
    | 'text'
    | 'status'
    | 'creator'
    | 'type'
    | 'tag'
    | 'size'
    | 'rating'
    | 'favorite'
    | 'license';

/** Fields whose tokens cannot be evaluated yet (no data on VarPackage). */
export const INERT_FIELDS: readonly TokenField[] = ['rating', 'favorite', 'license'];

export interface SearchToken {
    field: TokenField;
    op: TokenOp;
    /** The right-hand side, lower-cased and trimmed. For `text` this is the word. */
    value: string;
    /** The exact substring the user typed, preserved for chip display. */
    raw: string;
}

export interface ParsedQuery {
    tokens: SearchToken[];
}

export type PackagePredicate = (pkg: VarPackage) => boolean;
