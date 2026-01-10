import React, { useEffect, useState, useRef } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';
import { motion } from 'framer-motion';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
    id: string;
    message: string;
    type: ToastType;
    action?: () => void;
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

    useEffect(() => {
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
    }, [isPaused, onRemove, toast.id]);

    const handleClick = () => {
        if (toast.action) {
            toast.action();
        }
    };

    const icons = {
        success: <CheckCircle size={20} className="text-green-400" />,
        error: <AlertCircle size={20} className="text-red-400" />,
        info: <Info size={20} className="text-blue-400" />,
        warning: <AlertTriangle size={20} className="text-yellow-400" />
    };

    const bgColors = {
        success: "bg-gray-800 border-green-500/20",
        error: "bg-gray-800 border-red-500/20",
        info: "bg-gray-800 border-blue-500/20",
        warning: "bg-gray-800 border-yellow-500/20"
    };

    const progressColors = {
        success: "bg-green-500",
        error: "bg-red-500",
        info: "bg-blue-500",
        warning: "bg-yellow-500"
    };

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
                    className={clsx("h-full origin-left", progressColors[toast.type])}
                    style={{
                        animation: `toast-progress ${DURATION}ms linear forwards`,
                        animationPlayState: isPaused ? 'paused' : 'running'
                    }}
                />
            </div>
        </motion.div>
    );
};
