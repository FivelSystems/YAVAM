import { VarPackage } from '../types';
import { PackagePredicate, ParsedQuery } from './search';
import { SortKey, compareSortKeys, sortKeyOf } from './packageSort';

/**
 * Where the grid is relative to a scan.
 * - `idle`: no scan, or a scan still waiting on the cache; plain live view.
 * - `held`: cold scan, enumeration incomplete; no partial grid is shown.
 * - `placed`: a slot ledger is open; scan events cannot move placed cards.
 */
export type ScanSlotsPhase = 'idle' | 'held' | 'placed';

export interface ScanSlots {
    phase: ScanSlotsPhase;
    /** Changes whenever a new set of slots is established, so a ledger never outlives its scan. */
    epoch: number;
}

export const IDLE_SLOTS: ScanSlots = { phase: 'idle', epoch: 0 };

export interface SlotView {
    packages: VarPackage[];
    /** Matching packages that are held back until the scan completes. */
    pendingCount: number;
}

export const EMPTY_SLOT_VIEW: SlotView = { packages: [], pendingCount: 0 };

/** Enabling or disabling renames the file; the slot must survive that. */
const DISABLED_SUFFIX = /\.disabled$/i;

export const slotKeyOf = (filePath: string): string => filePath.replace(DISABLED_SUFFIX, '');

const isIdentified = (pkg: VarPackage): boolean => pkg.scanPhase !== 'discovered';

const ENUMERATION_KNOWN_STATUSES: readonly string[] = ['enabled', 'disabled'];

/**
 * True when the query reads data that only exists after a package is opened
 * (type, tag, analysis statuses). Name, creator, size, rating and favourite are
 * answered by enumeration or by the user's own metadata.
 */
export const dependsOnIdentifiedContent = (query: ParsedQuery | null): boolean =>
    !!query && query.tokens.some(token => {
        if (token.field === 'type' || token.field === 'tag') return true;
        return token.field === 'status' && !ENUMERATION_KNOWN_STATUSES.includes(token.value);
    });

export interface SlotLedger {
    epoch: number;
    placed: Map<string, SortKey>;
    identifiedAtOpen: Set<string>;
    decisions: Map<string, boolean>;
    decisionsQuery: string;
}

/** Snapshots the packages on screen so later scan events can neither move nor insert cards. */
export const openLedger = (epoch: number, packages: VarPackage[]): SlotLedger => {
    const placed = new Map<string, SortKey>();
    const identifiedAtOpen = new Set<string>();
    for (const pkg of packages) {
        const key = slotKeyOf(pkg.filePath);
        placed.set(key, sortKeyOf(pkg));
        if (isIdentified(pkg)) identifiedAtOpen.add(key);
    }
    return { epoch, placed, identifiedAtOpen, decisions: new Map(), decisionsQuery: '' };
};

interface ViewInput {
    packages: VarPackage[];
    matches: PackagePredicate | null;
    sortMode: string;
}

export const computeLiveView = ({ packages, matches, sortMode }: ViewInput): SlotView => {
    const members = matches ? packages.filter(matches) : [...packages];
    const keys = new Map(members.map(pkg => [pkg, sortKeyOf(pkg)]));
    members.sort((a, b) => compareSortKeys(sortMode, keys.get(a)!, keys.get(b)!));
    return { packages: members, pendingCount: 0 };
};

interface LedgerViewInput extends ViewInput {
    ledger: SlotLedger;
    query: string;
    contentDependent: boolean;
}

/**
 * Sorts by the keys snapshotted when the ledger opened, and decides content-
 * dependent membership once per package, so identification never reorders or
 * reshuffles cards that are already visible. Everything else waits as pending.
 */
export const computeLedgerView = ({ packages, matches, sortMode, ledger, query, contentDependent }: LedgerViewInput): SlotView => {
    if (ledger.decisionsQuery !== query) {
        ledger.decisions.clear();
        ledger.decisionsQuery = query;
    }

    const isMember = (pkg: VarPackage, key: string): boolean => {
        if (!matches) return true;
        if (!contentDependent) return matches(pkg);
        const decided = ledger.decisions.get(key);
        if (decided !== undefined) return decided;
        if (!ledger.identifiedAtOpen.has(key)) return false;
        const decision = matches(pkg);
        ledger.decisions.set(key, decision);
        return decision;
    };

    const members: { pkg: VarPackage; key: SortKey }[] = [];
    let pendingCount = 0;

    for (const pkg of packages) {
        const slotKey = slotKeyOf(pkg.filePath);
        const placedKey = ledger.placed.get(slotKey);
        const matchesNow = !matches || matches(pkg);
        if (!placedKey) {
            if (matchesNow) pendingCount++;
            continue;
        }
        if (isMember(pkg, slotKey)) members.push({ pkg, key: placedKey });
        else if (matchesNow) pendingCount++;
    }

    members.sort((a, b) => compareSortKeys(sortMode, a.key, b.key));
    return { packages: members.map(member => member.pkg), pendingCount };
};
