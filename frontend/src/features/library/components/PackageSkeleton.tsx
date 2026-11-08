import { memo } from 'react';
import clsx from 'clsx';
import { VarPackage } from '../../../types';

interface PackageSkeletonProps {
    /** Row parsed from the file name. Without it the slot is reserved: an empty, inert shell. */
    pkg?: VarPackage;
    viewMode?: 'grid' | 'list';
    hidePackageNames?: boolean;
    hideCreatorNames?: boolean;
    shimmering?: boolean;
    className?: string;
}

/**
 * Card shell for slots whose package is not identified yet (`reserved` and
 * `listed`). Dimensions match PackageCard so the real card replaces it in place.
 */
const PackageSkeleton = memo(({
    pkg,
    viewMode = 'grid',
    hidePackageNames = false,
    hideCreatorNames = false,
    shimmering = false,
    className,
}: PackageSkeletonProps) => {
    const name = pkg ? pkg.meta.packageName || pkg.fileName : '';
    const creator = pkg?.meta.creator || '';
    const version = pkg?.meta.version || '';
    const hiddenText = "opacity-0 select-none";

    if (viewMode === 'list') {
        return (
            <div
                aria-hidden={!pkg || undefined}
                className={clsx("relative rounded-lg border bg-gray-900 flex items-center h-20 p-2 gap-3 overflow-hidden", className)}
            >
                <div className={clsx("h-16 w-16 rounded bg-gray-800 shrink-0", shimmering && "scan-shimmer")} />
                {pkg && (
                    <div className="flex-1 min-w-0">
                        <h3 className={clsx("font-bold text-gray-400 text-sm truncate mb-1", hidePackageNames && hiddenText)}>{name}</h3>
                        <div className="flex justify-between items-center text-xs text-gray-500">
                            <span className={clsx("truncate", hideCreatorNames && hiddenText)}>{creator || "Unknown"}</span>
                            <span>v{version}</span>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div
            aria-hidden={!pkg || undefined}
            className={clsx("relative rounded-xl border-2 overflow-hidden bg-gray-900 aspect-square", className)}
        >
            <div className={clsx("absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-900", shimmering && "scan-shimmer")} />
            {pkg && (
                <div className="absolute inset-0 p-4 flex flex-col justify-end">
                    <h3 className={clsx("font-bold text-gray-300 leading-tight line-clamp-2 text-sm sm:text-base mb-1", hidePackageNames && hiddenText)}>{name}</h3>
                    <div className="flex justify-between items-center text-xs text-gray-400">
                        <span className={clsx("truncate max-w-[70%]", hideCreatorNames && hiddenText)}>{creator || "Unknown"}</span>
                        <span>v{version || "1"}</span>
                    </div>
                </div>
            )}
        </div>
    );
});

PackageSkeleton.displayName = 'PackageSkeleton';
export default PackageSkeleton;
