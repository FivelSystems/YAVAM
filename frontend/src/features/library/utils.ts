import { VarPackage } from "../../types";
import { PACKAGE_STATUS } from "../../constants";

export type PackageStatus = typeof PACKAGE_STATUS[keyof typeof PACKAGE_STATUS];

/**
 * Determines the logical status of a package for UI display.
 * Prioritizes critical issues (Corrupt/Missing) over warnings (Duplicate/Obsolete).
 */
export const getPackageStatus = (pkg: VarPackage | undefined): PackageStatus => {
    if (!pkg) return PACKAGE_STATUS.MISSING;
    if (pkg.isCorrupt) return PACKAGE_STATUS.CORRUPT;

    // 1. Functional Checks (Top Priority)
    // User Requirement: "if the duplicates are disabled, we should ignore their statuses."
    // So we check isEnabled FIRST. If disabled -> return DISABLED (Gray).
    if (!pkg.isEnabled) return PACKAGE_STATUS.DISABLED;

    // 2. Enabled Warning Checks
    // User Requirement: "Obsolete and duplicate files can be presented as enabled too."
    // If we are here, the package IS enabled. So we warn if it is a duplicate.
    if (pkg.isExactDuplicate) return PACKAGE_STATUS.DUPLICATE;
    if (pkg.isDuplicate) return PACKAGE_STATUS.OBSOLETE;

    // 3. Functional Warnings
    if (pkg.missingDeps && pkg.missingDeps.length > 0) return PACKAGE_STATUS.MISMATCH;

    // 4. Roots (Unreferenced)
    if (pkg.isOrphan) return PACKAGE_STATUS.ROOT;

    return PACKAGE_STATUS.VALID;
};

/**
 * Finds the best matching package for a given ID, prioritizing Enabled > Valid > Any.
 * Used for resolving "Used By" relationships where multiple copies (duplicates) might exist.
 */
export const findBestPackageMatch = (allPackages: VarPackage[], targetId: string): VarPackage | undefined => {
    // Safety check for empty inputs
    if (!targetId || !allPackages) return undefined;

    const targetLower = targetId.toLowerCase();

    // 1. Filter all matches (Exact ID)
    let candidates = allPackages.filter(p =>
        `${p.meta.creator}.${p.meta.packageName}.${p.meta.version}`.toLowerCase() === targetLower
    );

    // 2. Fallback: If no exact match, look for ANY version of this package (Creator.Package)
    // This aligns with the "Relaxed Analysis" logic.
    if (candidates.length === 0) {
        // Parse Base ID. This handles "Creator.Package.Version" -> "Creator.Package"
        // We use the same recursive strip logic or just strict parsing if standard.
        // Given we don't know the exact split, we'll try to find packages that START with the Creator.Package part?
        // No, that's risky.
        // Better: We iterate all packages and check if targetId *starts with* their Creator.Package base?
        // Or we aggressively try to match Creator.Package.

        // Let's assume standard Creator.Name.Version format for the fallback.
        // We can just check matches on Creator + PackageName.
        candidates = allPackages.filter(p => {
            const pkgBase = `${p.meta.creator}.${p.meta.packageName}`.toLowerCase();
            // Does the targetId start with this base?
            // e.g. target "A.B.1" starts with "A.B"?
            return targetLower.startsWith(pkgBase);
        });
    }

    if (candidates.length === 0) return undefined;

    // Sort Candidates: Enabled First, then Version Descending
    candidates.sort((a, b) => {
        if (a.isEnabled && !b.isEnabled) return -1;
        if (!a.isEnabled && b.isEnabled) return 1;
        // Version Sort (Simple String Compare is "Okay" for fallback, but ideally SemVer)
        return (b.meta.version || "").localeCompare(a.meta.version || "", undefined, { numeric: true });
    });

    // Return best candidate
    return candidates[0];
};

/**
 * Returns the inline style for privacy blurring if enabled.
 */
export const getBlurStyle = (censor: boolean, blur: number) =>
    censor ? { filter: `blur(${blur}px)` } : undefined;
