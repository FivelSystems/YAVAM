import React from 'react';

interface ScanProgressProps {
    current: number;
    total: number;
    label?: string;
}

export const ScanProgressBar: React.FC<ScanProgressProps> = ({ current, total, label = "Scanning" }) => {
    // If total is 0, we can't show percentage, but we show generic spinner or "0"
    const percentage = total > 0 ? (current / total) * 100 : 0;

    return (
        <div className="flex flex-col w-48 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-end mb-1 text-[10px] uppercase font-bold tracking-wider text-gray-400">
                <span className="text-blue-400">{label}</span>
                <span className="font-mono">{current} / {total}</span>
            </div>
            <div className="h-1.5 w-full bg-gray-700 rounded-full overflow-hidden">
                <div
                    className="h-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)] transition-all duration-200 ease-out"
                    style={{ width: `${percentage}%` }}
                />
            </div>
        </div>
    );
};
