import { useState } from 'react';
import { ToastItem, ToastType } from '../components/ui/Toast';

export const useToasts = () => {
    const [maxToasts, setMaxToasts] = useState(() => parseInt(localStorage.getItem('maxToasts') || '5'));
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const addToast = (message: string, type: ToastType = 'info', action?: () => void) => {
        const id = Date.now().toString(36) + Math.random().toString(36).substr(2);
        setToasts(prev => {
            const newToasts = [...prev, { id, message, type, action }];
            if (newToasts.length > maxToasts) {
                return newToasts.slice(newToasts.length - maxToasts);
            }
            return newToasts;
        });
    };

    const removeToast = (id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    const handleSetMaxToasts = (val: number) => {
        setMaxToasts(val);
        localStorage.setItem('maxToasts', val.toString());
    };

    return {
        toasts,
        addToast,
        removeToast,
        maxToasts,
        setMaxToasts: handleSetMaxToasts
    };
};
