import React, { useEffect } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';
import { motion } from 'framer-motion';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
    id: string;
    message: string;
    type: ToastType;
}

interface ToastProps {
    toast: ToastItem;
    onRemove: (id: string) => void;
}

export const Toast: React.FC<ToastProps> = ({ toast, onRemove }) => {
    useEffect(() => {
        const timer = setTimeout(() => onRemove(toast.id), 5000);
        return () => clearTimeout(timer);
    }, [toast.id, onRemove]);

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

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.9 }}
            className={clsx(
                "flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border w-80 mb-2 pointer-events-auto backdrop-blur-sm",
                bgColors[toast.type]
            )}
        >
            <div className="shrink-0">{icons[toast.type]}</div>
            <p className="text-sm text-gray-200 flex-1 font-medium break-words leading-snug">{toast.message}</p>
            <button onClick={() => onRemove(toast.id)} className="text-gray-500 hover:text-white transition-colors p-1">
                <X size={16} />
            </button>
        </motion.div>
    );
};
