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
}
