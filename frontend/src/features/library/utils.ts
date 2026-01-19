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

    // 1. Filter all matches
    const candidates = allPackages.filter(p =>
        `${p.meta.creator}.${p.meta.packageName}.${p.meta.version}`.toLowerCase() === targetLower
    );

    if (candidates.length === 0) return undefined;
    if (candidates.length === 1) return candidates[0];

    // 2. Prioritize Enabled & Valid
    const enabledAndValid = candidates.find(p => p.isEnabled && !p.isCorrupt);
    if (enabledAndValid) return enabledAndValid;

    // 3. Prioritize Valid (even if disabled)
    const valid = candidates.find(p => !p.isCorrupt);
    if (valid) return valid;

    // 4. Fallback to first found
    return candidates[0];
};

/**
 * Returns the inline style for privacy blurring if enabled.
 */
export const getBlurStyle = (censor: boolean, blur: number) =>
    censor ? { filter: `blur(${blur}px)` } : undefined;
