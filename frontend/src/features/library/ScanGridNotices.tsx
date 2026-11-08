import React from 'react';
import { ScanStages } from '../../types';
import { ScanProgressBar } from '../../components/common/ScanProgressBar';

interface ScanHoldNoticeProps {
    stages: ScanStages;
}

/** Stands in for the grid while a cold scan is still enumerating the library. */
export const ScanHoldNotice: React.FC<ScanHoldNoticeProps> = ({ stages }) => (
    <div role="status" className="h-full flex flex-col items-center justify-center gap-4 text-gray-400 p-4 text-center">
        <ScanProgressBar stages={stages} variant="linear" />
        <p className="text-sm">Reading your library. Packages appear once the list is complete.</p>
    </div>
);

interface ScanPendingNoticeProps {
    count: number;
}

/** Tells the user matching packages are waiting for the scan to finish so visible cards stay put. */
export const ScanPendingNotice: React.FC<ScanPendingNoticeProps> = ({ count }) => {
    if (count === 0) return null;
    const noun = count === 1 ? 'package' : 'packages';
    return (
        <div role="status" className="shrink-0 px-4 py-2 text-xs text-gray-400 bg-gray-800/60 border-b border-white/5">
            {count.toLocaleString()} more {noun} will appear when the scan finishes.
        </div>
    );
};
