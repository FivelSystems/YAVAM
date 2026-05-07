import { memo } from 'react';

interface PackageSkeletonProps {
    viewMode?: 'grid' | 'list';
}

/**
 * Skeleton card shown during the Light Pass (scanPhase === 'discovered').
 * Matches PackageCard dimensions exactly to prevent layout shift when real data arrives.
 */
const PackageSkeleton = memo(({ viewMode = 'grid' }: PackageSkeletonProps) => {
    if (viewMode === 'list') {
        return (
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-800/50 animate-pulse">
                {/* Thumbnail stub */}
                <div className="w-10 h-10 rounded bg-gray-700 shrink-0" />
                {/* Text stubs */}
                <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                    <div className="h-3 bg-gray-700 rounded w-2/5" />
                    <div className="h-2.5 bg-gray-700/60 rounded w-1/4" />
                </div>
                {/* Size stub */}
                <div className="h-2.5 bg-gray-700/40 rounded w-10 shrink-0" />
            </div>
        );
    }

    return (
        <div className="flex flex-col rounded-xl overflow-hidden bg-gray-800/60 border border-gray-700/40 animate-pulse">
            {/* Thumbnail area */}
            <div className="relative aspect-[4/3] bg-gray-700/60 flex items-center justify-center">
                {/* Loading pulse ring */}
                <div className="w-8 h-8 rounded-full border-2 border-gray-600 border-t-gray-400 animate-spin opacity-40" />
            </div>
            {/* Card footer */}
            <div className="px-2.5 py-2 flex flex-col gap-1.5">
                <div className="h-3 bg-gray-700 rounded w-4/5" />
                <div className="h-2.5 bg-gray-600/50 rounded w-1/2" />
            </div>
        </div>
    );
});

PackageSkeleton.displayName = 'PackageSkeleton';
export default PackageSkeleton;
