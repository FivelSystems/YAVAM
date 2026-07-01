export type ScanPhase = 'discovered' | 'scanned' | 'analyzed';

export interface VarPackage {
    filePath: string;
    fileName: string;
    size: number;
    meta: {
        creator: string;
        packageName: string;
        version: string;
        description?: string;
        dependencies?: Record<string, any>;
    };
    thumbnailPath: string;
    thumbnailBase64?: string;
    isEnabled: boolean;
    hasThumbnail: boolean;
    missingDeps: string[];
    isDuplicate: boolean;
    isExactDuplicate: boolean;
    type?: string;
    categories: string[];
    tags?: string[];
    isCorrupt?: boolean;
    isOrphan?: boolean;
    referencedBy?: string[];
    obsoletedBy?: string;
    /** ISO 8601 package creation date; used for date sorting. */
    creationDate?: string;
    /** Tracks how much we know about this package from the three-phase scan. */
    scanPhase: ScanPhase;
}

/** Where a dependency/dependent lives, for cross-library jump from the panel. */
export interface DependencyLocation {
    query: string;
    found: boolean;
    libraryPath: string;
    libraryLabel: string;
    filePath: string;
    packageName: string;
    creator: string;
    version: string;
    isEnabled: boolean;
}

/** Payload of the "package:analyzed" event — dep/dup/orphan flags per package. */
export interface PackageAnalysis {
    filePath: string;
    missingDeps: string[];
    isDuplicate: boolean;
    isExactDuplicate: boolean;
    isOrphan: boolean;
    obsoletedBy?: string;
    referencedBy?: string[];
}

/** Payload of the "scan:stage" event — progress across all three phases. */
export interface ScanStageProgress {
    stage: 'discovery' | 'scanning' | 'analyzing';
    current: number;
    total: number;
    done: boolean;
}

export interface ScanStages {
    discovery: { current: number; total: number; done: boolean };
    scanning:  { current: number; total: number; done: boolean };
    analyzing: { current: number; total: number; done: boolean };
}
