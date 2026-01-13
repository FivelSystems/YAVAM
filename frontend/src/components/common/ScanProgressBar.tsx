import React from 'react';

interface ScanProgressProps {
    current: number;
    total: number;
    label?: string;
    variant?: 'linear' | 'circular';
}

export const ScanProgressBar: React.FC<ScanProgressProps> = ({ current, total, label = "Scanning", variant = 'linear' }) => {
    // If total is 0, we can't show percentage, but we show generic spinner or "0"
    const percentage = total > 0 ? (current / total) * 100 : 0;

    if (variant === 'circular') {
        const radius = 10;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (percentage / 100) * circumference;

        return (
            <div className="flex items-center gap-2 animate-in fade-in zoom-in-95 duration-200">
                <div className="relative w-8 h-8 flex items-center justify-center shrink-0">
                    {/* Background Circle */}
                    <svg className="transform -rotate-90 w-full h-full">
                        <circle
                            className="text-gray-700"
                            strokeWidth="3"
                            stroke="currentColor"
                            fill="transparent"
                            r={radius}
                            cx="16"
                            cy="16"
                        />
                        {/* Progress Circle */}
                        <circle
                            className="text-blue-500 transition-all duration-300 ease-out"
                            strokeWidth="3"
                            strokeDasharray={circumference}
                            strokeDashoffset={offset}
                            strokeLinecap="round"
                            stroke="currentColor"
                            fill="transparent"
                            r={radius}
                            cx="16"
                            cy="16"
                        />
                    </svg>
                </div>
                {/* Feedback Text for Circular Mode (Mobile) */}
                <div className="flex flex-col justify-center">
                    <span className="text-[10px] font-bold text-gray-400 uppercase leading-none">{label}</span>
                    <span className="text-xs font-mono text-gray-300 leading-none mt-0.5">{Math.round(percentage)}%</span>
                </div>
            </div>
        );
    }

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
