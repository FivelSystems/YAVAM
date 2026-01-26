
export const PACKAGES = {
    CORE: {
        ID: "VaM.Core.latest",
        BASE_ID: "vam.core"
    }
};

export const PACKAGE_STATUS = {
    VALID: 'valid',
    MISMATCH: 'mismatch',
    MISSING: 'missing',
    SCANNING: 'scanning',
    SYSTEM: 'system',
    CORRUPT: 'corrupt',
    DISABLED: 'disabled',
    WARNING: 'warning',
    ERROR: 'error',
    NORMAL: 'normal',
    DUPLICATE: 'duplicate',
    OBSOLETE: 'obsolete',
    ROOT: 'root'
} as const;

export const GROUPS = {
    STATUS: 'status',
    CREATOR: 'creator',
    TYPE: 'type'
} as const;

export const STATUS_FILTERS = {
    ALL: 'all',
    ENABLED: 'enabled',
    DISABLED: 'disabled',
    MISSING_DEPS: 'missing-deps',
    VERSION_CONFLICTS: 'version-conflicts',
    EXACT_DUPLICATES: 'exact-duplicates',
    CORRUPT: 'corrupt',
    UNREFERENCED: 'unreferenced'
} as const;
