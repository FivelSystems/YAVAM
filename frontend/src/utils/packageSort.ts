import { VarPackage } from '../types';

/**
 * The only package fields a sort may read. All of them are known at enumeration
 * time (file name, size, mtime), so identifying a package can never reorder it.
 */
export interface SortKey {
    filePath: string;
    fileName: string;
    size: number;
    creationDate: string;
}

export const sortKeyOf = (pkg: VarPackage): SortKey => ({
    filePath: pkg.filePath,
    fileName: pkg.fileName || '',
    size: pkg.size,
    creationDate: pkg.creationDate || '',
});

const timestampOf = (isoDate: string): number => new Date(isoDate || 0).getTime();

const compareByMode = (sortMode: string, a: SortKey, b: SortKey): number => {
    switch (sortMode) {
        case 'name-asc': return a.fileName.localeCompare(b.fileName);
        case 'name-desc': return b.fileName.localeCompare(a.fileName);
        case 'size-asc': return a.size - b.size;
        case 'size-desc': return b.size - a.size;
        case 'date-newest': return timestampOf(b.creationDate) - timestampOf(a.creationDate);
        case 'date-oldest': return timestampOf(a.creationDate) - timestampOf(b.creationDate);
        default: return 0;
    }
};

/** Total order: the sort mode first, then the unique file path as tie-breaker. */
export const compareSortKeys = (sortMode: string, a: SortKey, b: SortKey): number =>
    compareByMode(sortMode, a, b) || a.filePath.localeCompare(b.filePath);
