import { VarPackage } from "../types";

/**
 * Normalizes an ID for comparison (Lowercasing).
 * STRICT: Does NOT replace underscores or spaces. Dots are the only structure.
 */
export const normalizeId = (id: string): string => id.toLowerCase();

/**
 * Robustly compares two version strings.
 * Returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal.
 */
export const compareVersions = (v1: string, v2: string): number => {
    if (v1 === v2) return 0;
    const parts1 = v1.split('.').map(p => parseInt(p, 10));
    const parts2 = v2.split('.').map(p => parseInt(p, 10));

    const len = Math.max(parts1.length, parts2.length);
    for (let i = 0; i < len; i++) {
        const n1 = parts1[i] || 0;
        const n2 = parts2[i] || 0;
        if (n1 > n2) return 1;
        if (n1 < n2) return -1;
    }
    return 0;
};

/**
 * Finds the best package match for a given Target Dependency ID.
 * 
 * Logic:
 * 1. Exact Match (Creator.Package.Version).
 * 2. Recursive Base Lookup (Stripping suffixes driven by dots).
 *    - E.g. "A.B.C.1" -> checks "A.B.C", then "A.B".
 * 
 * Priority for Candidates:
 * 1. ENABLED + VALID (Top Priority)
 * 2. ENABLED + CORRUPT (Still user-selected)
 * 3. DISABLED + VALID
 * 4. DISABLED + CORRUPT
 * 
 * Tie-Breaker: Version (Descending - Latest First).
 */
export const resolveDependency = (allPackages: VarPackage[], targetId: string): VarPackage | undefined => {
    if (!targetId || !allPackages) return undefined;

    const targetLower = normalizeId(targetId);

    // Filter relevant packages first to avoid iterating huge lists repeatedly?
    // Actually, simple iteration is generally fast unless library is massive.
    // To handle "Recursive" efficiently, we look for matches.

    // 1. Exact Match Attempt
    const exactMatches = allPackages.filter(p => {
        const id = `${p.meta.creator}.${p.meta.packageName}.${p.meta.version}`.toLowerCase();
        return id === targetLower;
    });

    if (exactMatches.length > 0) {
        return selectBestCandidate(exactMatches);
    }

    // 2. Recursive Base Lookup (Fuzzy Version/Name Resolution)
    // We strip the last segment (after dot) and see if any package *exactly matches* that BaseID.
    // BaseID = Creator.Name

    // Note: This relies on the assumption that a valid BaseID exists in the system.
    // We iterate: Check if any package has `Creator.Name` matching the stripped target.

    let currentId = targetLower;
    while (currentId.includes('.')) {
        const lastDot = currentId.lastIndexOf('.');
        if (lastDot === -1) break;
        currentId = currentId.substring(0, lastDot);

        // Check: Do any packages have this BaseID?
        // BaseID = Creator.PackageName
        const candidates = allPackages.filter(p => {
            const base = `${p.meta.creator}.${p.meta.packageName}`.toLowerCase();
            return base === currentId;
        });

        if (candidates.length > 0) {
            return selectBestCandidate(candidates);
        }
    }

    return undefined;
};

/**
 * Selects the "Best" candidate from a list of matches.
 * Rules: Enabled > Valid > Version.
 */
const selectBestCandidate = (candidates: VarPackage[]): VarPackage => {
    // Sort logic
    return candidates.sort((a, b) => {
        // 1. Enabled Preference
        if (a.isEnabled && !b.isEnabled) return -1;
        if (!a.isEnabled && b.isEnabled) return 1;

        // 2. Validity Preference (Not Corrupt)
        if (!a.isCorrupt && b.isCorrupt) return -1;
        if (a.isCorrupt && !b.isCorrupt) return 1;

        // 3. Version Preference (Newest First)
        return compareVersions(b.meta.version || "0", a.meta.version || "0");
    })[0];
};
