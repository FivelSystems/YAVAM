export const UNSPECIFIED_LICENSE = 'unspecified';

/** Licenses whose content cannot be re-acquired for free, so deleting it is risky. */
const NON_REDISTRIBUTABLE_LICENSES: readonly string[] = ['pc', 'pc-ea'];

/**
 * Normalise a declared `licenseType` into its `license:` token value.
 * Each declared value maps to its own slug (`CC BY-SA` -> `cc-by-sa`): licenses
 * grant different rights, so a token never matches a related license by prefix.
 */
export const licenseSlug = (licenseType: string | undefined): string => {
    const slug = (licenseType ?? '').trim().toLowerCase().replace(/\s+/g, '-');
    return slug || UNSPECIFIED_LICENSE;
};

export const isNonRedistributableLicense = (slug: string): boolean =>
    NON_REDISTRIBUTABLE_LICENSES.includes(slug);
