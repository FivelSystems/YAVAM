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
    const [elapsed, setElapsed] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const elapsedRef = useRef(0);

    const handleClick = () => {
        if (toast.action) {
            toast.action();
            // Don't remove immediately, let user see feedback? 
            // Or maybe remove it? Usually clicking a notification dismisses it OR performs action.
            // Let's perform action. If action navigates away, toast might persist.
        }
    };

    useEffect(() => {
        let animationFrameId: number;
        let lastTime = Date.now();

        const updateTimer = () => {
            if (isPaused) {
                lastTime = Date.now(); // Keep advancing 'now' so we don't jump when unpausing
                animationFrameId = requestAnimationFrame(updateTimer);
                return;
            }

            const now = Date.now();
            const delta = now - lastTime;
            lastTime = now;

            elapsedRef.current += delta;
            setElapsed(elapsedRef.current);

            if (elapsedRef.current >= DURATION) {
                onRemove(toast.id);
            } else {
                animationFrameId = requestAnimationFrame(updateTimer);
            }
        };

        animationFrameId = requestAnimationFrame(updateTimer);

        return () => cancelAnimationFrame(animationFrameId);
    }, [isPaused, toast.id, onRemove]);

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

    const progress = Math.min(100, (elapsed / DURATION) * 100);

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
            <div className="shrink-0">{icons[toast.type]}</div>
            <p className="text-sm text-gray-200 flex-1 font-medium break-words leading-snug z-10">{toast.message}</p>
            <button onClick={() => onRemove(toast.id)} className="text-gray-500 hover:text-white transition-colors p-1 z-10">
                <X size={16} />
            </button>

            {/* Progress Bar */}
            <div className="absolute bottom-0 left-0 h-1 w-full bg-black/20">
                <div
                    className={clsx("h-full transition-all duration-75 ease-linear", progressColors[toast.type])}
                    style={{ width: `${progress}%` }}
                />
            </div>
        </motion.div>
    );
};
