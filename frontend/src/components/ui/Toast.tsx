import React, { useEffect, useState, useRef } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import { motion } from 'framer-motion';

export type ToastType = 'success' | 'error' | 'info' | 'warning' | 'progress';

export interface ToastItem {
    id: string;
    message: string;
    type: ToastType;
    action?: () => void;
    /** Only used when type === 'progress'. Updated in-place via updateToast(). */
    progress?: { current: number; total: number };
    /**
     * When false, the component's own countdown timer is disabled.
     * Used by completeProgressToast to let the context's setTimeout be the sole dismiss controller.
     * Defaults to true for all normal toasts.
     */
    autoClose?: boolean;
}

interface ToastProps {
    toast: ToastItem;
    onRemove: (id: string) => void;
}

export const Toast: React.FC<ToastProps> = ({ toast, onRemove }) => {
    const DURATION = 3000;
    const [isPaused, setIsPaused] = useState(false);

    const startRef = useRef(Date.now());
    const remainingRef = useRef(DURATION);
    const timerRef = useRef<ReturnType<typeof setTimeout>>();

    // Progress toasts and toasts that opt out of auto-close are persistent.
    const isProgress = toast.type === 'progress';
    const shouldAutoClose = toast.autoClose !== false; // default true

    useEffect(() => {
        if (isProgress || !shouldAutoClose) return; // no auto-dismiss for these
        if (isPaused) return;

        startRef.current = Date.now();
        timerRef.current = setTimeout(() => {
            onRemove(toast.id);
        }, remainingRef.current);

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            const elapsed = Date.now() - startRef.current;
            remainingRef.current = Math.max(0, remainingRef.current - elapsed);
        };
    }, [isPaused, isProgress, shouldAutoClose, onRemove, toast.id]);

    const handleClick = () => {
        if (toast.action) {
            toast.action();
        }
    };

    const icons = {
        success: <CheckCircle size={20} className="text-green-400" />,
        error: <AlertCircle size={20} className="text-red-400" />,
        info: <Info size={20} className="text-blue-400" />,
        warning: <AlertTriangle size={20} className="text-yellow-400" />,
        progress: <Trash2 size={20} className="text-violet-400" />,
    };

    const bgColors = {
        success: "bg-gray-800 border-green-500/20",
        error: "bg-gray-800 border-red-500/20",
        info: "bg-gray-800 border-blue-500/20",
        warning: "bg-gray-800 border-yellow-500/20",
        progress: "bg-gray-800 border-violet-500/30",
    };

    const progressBarColors = {
        success: "bg-green-500",
        error: "bg-red-500",
        info: "bg-blue-500",
        warning: "bg-yellow-500",
        progress: "bg-violet-500",
    };

    if (isProgress && toast.progress) {
        const { current, total } = toast.progress;
        const pct = total > 0 ? Math.round((current / total) * 100) : 0;

        return (
            <motion.div
                layout
                initial={{ opacity: 0, y: 50, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 20, scale: 0.9 }}
                className={clsx(
                    "relative flex flex-col gap-2 px-4 py-3 rounded-lg shadow-lg border w-80 mb-2 pointer-events-auto backdrop-blur-sm overflow-hidden",
                    bgColors.progress
                )}
            >
                {/* Header row */}
                <div className="flex items-center gap-3">
                    <div className="shrink-0">{icons.progress}</div>
                    <p className="text-sm text-gray-200 flex-1 font-medium leading-snug z-10">{toast.message}</p>
                    <span className="text-xs font-mono text-violet-300 tabular-nums shrink-0">{pct}%</span>
                </div>

                {/* Progress bar track */}
                <div className="h-1.5 w-full bg-gray-700 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-violet-500 rounded-full transition-all duration-200 ease-out"
                        style={{ width: `${pct}%` }}
                    />
                </div>

                {/* File counter */}
                <div className="flex justify-between text-[10px] text-gray-500 font-mono">
                    <span>{current} / {total} files</span>
                    <span>{total - current} left</span>
                </div>
            </motion.div>
        );
    }

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.9 }}
            className={clsx(
                "relative flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border w-80 mb-2 pointer-events-auto backdrop-blur-sm overflow-hidden",
                bgColors[toast.type],
                toast.action && "cursor-pointer hover:bg-gray-700/50 transition-colors"
            )}
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
            onClick={handleClick}
        >
            {/* Inject Keyframes once per instance (or globally, but harmless here due to dedupe by browser) */}
            <style>{`
                @keyframes toast-progress {
                    from { width: 0%; }
                    to { width: 100%; }
                }
            `}</style>

            <div className="shrink-0">{icons[toast.type]}</div>
            <p className="text-sm text-gray-200 flex-1 font-medium break-words leading-snug z-10">{toast.message}</p>
            <button onClick={() => onRemove(toast.id)} className="text-gray-500 hover:text-white transition-colors p-1 z-10">
                <X size={16} />
            </button>

            {/* Progress Bar */}
            <div className="absolute bottom-0 left-0 h-1 w-full bg-black/20">
                <div
                    className={clsx("h-full origin-left", progressBarColors[toast.type])}
                    style={{
                        animation: `toast-progress ${DURATION}ms linear forwards`,
                        animationPlayState: isPaused ? 'paused' : 'running'
                    }}
                />
            </div>
        </motion.div>
    );
};
