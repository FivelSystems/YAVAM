import React from 'react';
import { ScanStages } from '../../types';

interface ScanProgressBarProps {
    stages: ScanStages;
    variant?: 'linear' | 'circular';
}

const PHASE_ORDER = ['discovery', 'scanning', 'analyzing'] as const;

const PHASE_CONFIG = {
    discovery: { label: 'Indexing', color: 'bg-blue-500', glow: 'shadow-[0_0_8px_rgba(59,130,246,0.6)]', text: 'text-blue-400' },
    scanning: { label: 'Analyzing', color: 'bg-amber-400', glow: 'shadow-[0_0_8px_rgba(251,191,36,0.6)]', text: 'text-amber-400' },
    analyzing: { label: 'Solving', color: 'bg-emerald-500', glow: 'shadow-[0_0_8px_rgba(16,185,129,0.6)]', text: 'text-emerald-400' },
} as const;

/** Returns the currently active scan phase. */
function activePhase(stages: ScanStages) {
    for (const key of PHASE_ORDER) {
        if (!stages[key].done) return key;
    }
    return 'analyzing'; // all done
}

/**
 * Single sequential progress bar.
 * Shows one bar at a time that represents the currently active scan phase.
 * Color and label transition as phases complete.
 *
 * linear   variant: labelled bar with count, shown on desktop toolbar
 * circular variant: compact percentage ring, shown on mobile toolbar
 */
export const ScanProgressBar: React.FC<ScanProgressBarProps> = ({ stages, variant = 'linear' }) => {
    const phase = activePhase(stages);
    const { current, total, done } = stages[phase];
    const pct = total > 0 ? Math.min(100, (current / total) * 100) : 0;
    const cfg = PHASE_CONFIG[phase];

    if (variant === 'circular') {
        const radius = 10;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (pct / 100) * circumference;

        return (
            <div className="flex items-center gap-2 animate-in fade-in zoom-in-95 duration-200">
                <div className="relative w-8 h-8 flex items-center justify-center shrink-0">
                    <svg className="transform -rotate-90 w-full h-full">
                        <circle className="text-gray-700" strokeWidth="3" stroke="currentColor" fill="transparent" r={radius} cx="16" cy="16" />
                        <circle
                            className={`${cfg.text} transition-all duration-300 ease-out`}
                            strokeWidth="3"
                            strokeDasharray={circumference}
                            strokeDashoffset={done ? 0 : offset}
                            strokeLinecap="round"
                            stroke="currentColor"
                            fill="transparent"
                            r={radius}
                            cx="16"
                            cy="16"
                        />
                    </svg>
                </div>
                <div className="flex flex-col justify-center">
                    <span className={`text-[10px] font-bold uppercase leading-none ${cfg.text}`}>{cfg.label}</span>
                    <span className="text-xs font-mono text-gray-300 leading-none mt-0.5">{Math.round(pct)}%</span>
                </div>
            </div>
        );
    }

    // Linear: single bar that transitions through phases
    return (
        <div className="flex flex-col w-48 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-end mb-1">
                <span className={`text-[10px] font-bold uppercase tracking-wider transition-colors duration-500 ${cfg.text}`}>
                    {cfg.label}
                </span>
                <span className="text-[10px] font-mono text-gray-500">
                    {done
                        ? `${total.toLocaleString()} ✓`
                        : total > 0
                            ? `${current.toLocaleString()} / ${total.toLocaleString()}`
                            : '—'
                    }
                </span>
            </div>
            <div className="h-1.5 w-full bg-gray-700 rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all duration-200 ease-out ${cfg.color} ${!done ? cfg.glow : ''}`}
                    style={{ width: `${done ? 100 : pct}%` }}
                />
            </div>
        </div>
    );
};
