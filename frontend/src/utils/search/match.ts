import { VarPackage } from '../../types';
import { INERT_FIELDS, PackagePredicate, ParsedQuery, SearchToken } from './types';

const SIZE_UNITS: Record<string, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 ** 2,
    gb: 1024 ** 3,
    tb: 1024 ** 4,
};

/** Parse a size literal like `500mb`, `1.5gb`, or bare bytes `1024` into bytes. */
const parseSize = (literal: string): number | null => {
    const match = literal.match(/^([\d.]+)\s*(b|kb|mb|gb|tb)?$/);
    if (!match) return null;
    const amount = parseFloat(match[1]);
    if (Number.isNaN(amount)) return null;
    const unit = match[2] ? SIZE_UNITS[match[2]] : 1;
    return amount * unit;
};

/** Evaluate a `size:` value (`>500mb`, `<1gb`, `10mb..100mb`, `>=1gb`) against bytes. */
const matchSize = (value: string, bytes: number): boolean => {
    const range = value.split('..');
    if (range.length === 2) {
        const lo = parseSize(range[0]);
        const hi = parseSize(range[1]);
        if (lo === null || hi === null) return false;
        return bytes >= lo && bytes <= hi;
    }
    const bound = value.match(/^(>=|<=|>|<)?(.+)$/);
    if (!bound) return false;
    const threshold = parseSize(bound[2]);
    if (threshold === null) return false;
    switch (bound[1]) {
        case '>': return bytes > threshold;
        case '<': return bytes < threshold;
        case '>=': return bytes >= threshold;
        case '<=': return bytes <= threshold;
        default: return bytes === threshold;
    }
};

/** A package is standalone when it declares no dependencies of its own. */
const isStandalone = (pkg: VarPackage): boolean => {
    const deps = pkg.meta?.dependencies;
    return !deps || Object.keys(deps).length === 0;
};

const matchStatus = (value: string, pkg: VarPackage): boolean => {
    const corrupt = !!pkg.isCorrupt;
    switch (value) {
        case 'enabled': return pkg.isEnabled && !corrupt;
        case 'disabled': return !pkg.isEnabled && !corrupt;
        case 'missing':
        case 'missing-deps': return !!pkg.missingDeps?.length && !corrupt;
        case 'corrupt': return corrupt;
        case 'duplicate':
        case 'conflict':
        case 'version-conflicts': return !!pkg.isDuplicate && !corrupt;
        case 'exact-duplicate':
        case 'exact-duplicates': return !!pkg.isExactDuplicate && !corrupt;
        case 'removable': return !!pkg.isRemovable && !corrupt;
        // No dependants (removable) and no dependencies (standalone) are the two
        // orthogonal dependency-relationship axes surfaced in the sidebar.
        case 'standalone': return isStandalone(pkg) && !corrupt;
        // hidden/visible depend on the dependency-visibility mode, which is not
        // built yet — treat as non-constraining for now.
        default: return true;
    }
};

/**
 * Evaluate a `rating:` value against the package's stored rating. Supports an
 * exact value (`rating:3`) or a single bound (`rating:>=4`, `rating:<2`). The
 * sidebar star emits the exact form; the bounded forms are search-only.
 */
const matchRating = (value: string, pkg: VarPackage): boolean => {
    const rating = pkg.rating ?? 0;
    const bound = value.match(/^(>=|<=|>|<)?(\d+)$/);
    if (!bound) return false;
    const threshold = parseInt(bound[2], 10);
    switch (bound[1]) {
        case '>': return rating > threshold;
        case '<': return rating < threshold;
        case '>=': return rating >= threshold;
        case '<=': return rating <= threshold;
        default: return rating === threshold;
    }
};

const matchType = (value: string, pkg: VarPackage): boolean => {
    if (pkg.categories && pkg.categories.length > 0) {
        return pkg.categories.some(c => c.toLowerCase() === value);
    }
    return (pkg.type || '').toLowerCase() === value;
};

const matchText = (value: string, pkg: VarPackage): boolean => {
    const haystack = [
        pkg.fileName,
        pkg.meta?.packageName,
        pkg.meta?.creator,
    ];
    return haystack.some(field => field?.toLowerCase().includes(value));
};

const tokenMatches = (token: SearchToken, pkg: VarPackage): boolean => {
    switch (token.field) {
        case 'text': return matchText(token.value, pkg);
        case 'status': return matchStatus(token.value, pkg);
        case 'creator': return (pkg.meta?.creator || '').toLowerCase() === token.value;
        case 'type': return matchType(token.value, pkg);
        case 'tag': return (pkg.tags || []).some(t => t.toLowerCase() === token.value);
        case 'size': return matchSize(token.value, pkg.size);
        case 'rating': return matchRating(token.value, pkg);
        // `favorite:true` keeps favourites; `favorite:false` keeps the rest.
        case 'favorite': return !!pkg.isFavorite === (token.value !== 'false');
        default: return true;
    }
};

/**
 * Compile a parsed query into a predicate. Combining rules:
 * - `require` tokens of the same field OR together; different fields AND.
 * - each free-text word is its own AND clause (a search box expects "red dress"
 *   to mean both, not either).
 * - `exclude` tokens drop any package they match.
 * - inert fields (license) do not constrain until their data lands.
 */
export const buildMatcher = (query: ParsedQuery): PackagePredicate => {
    const requireGroups = new Map<string, SearchToken[]>();
    const excludes: SearchToken[] = [];

    query.tokens.forEach((token, index) => {
        if (INERT_FIELDS.includes(token.field)) return;
        if (token.op === 'exclude') {
            excludes.push(token);
            return;
        }
        const key = token.field === 'text' ? `text:${index}` : token.field;
        const group = requireGroups.get(key);
        if (group) group.push(token);
        else requireGroups.set(key, [token]);
    });

    return (pkg: VarPackage): boolean => {
        for (const group of requireGroups.values()) {
            if (!group.some(t => tokenMatches(t, pkg))) return false;
        }
        for (const token of excludes) {
            if (tokenMatches(token, pkg)) return false;
        }
        return true;
    };
};
