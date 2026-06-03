import React, { createContext, useContext, useState } from 'react';
import { ToastItem, ToastType } from '../components/ui/Toast';

interface ToastContextType {
    toasts: ToastItem[];
    addToast: (message: string, type?: ToastType, action?: () => void) => string;
    /** Add a progress toast; returns its id so it can be updated/removed later. */
    addProgressToast: (message: string, current: number, total: number) => string;
    /** Mutate an existing toast in-place (e.g. update progress values). */
    updateToast: (id: string, patch: Partial<ToastItem>) => void;
    /**
     * Transitions a progress toast to a completion state (success/warning/error),
     * then auto-dismisses it after `dismissAfterMs` milliseconds.
     * This avoids the flash of "progress removed, new toast appears" UX.
     */
    completeProgressToast: (id: string, message: string, type: Exclude<ToastType, 'progress'>, dismissAfterMs?: number) => void;
    removeToast: (id: string) => void;
    maxToasts: number;
    setMaxToasts: (val: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [maxToasts, setMaxToastsState] = useState(() => parseInt(localStorage.getItem('maxToasts') || '5'));
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const addToast = (message: string, type: ToastType = 'info', action?: () => void): string => {
        const id = generateId();
        setToasts(prev => {
            const newToasts = [...prev, { id, message, type, action }];
            if (newToasts.length > maxToasts) {
                return newToasts.slice(newToasts.length - maxToasts);
            }
            return newToasts;
        });
        return id;
    };

    const addProgressToast = (message: string, current: number, total: number): string => {
        const id = generateId();
        setToasts(prev => {
            // Progress toasts are not subject to maxToasts eviction — they are persistent until done.
            return [...prev, { id, message, type: 'progress', progress: { current, total } }];
        });
        return id;
    };

    const updateToast = (id: string, patch: Partial<ToastItem>) => {
        setToasts(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
    };

    const completeProgressToast = (
        id: string,
        message: string,
        type: Exclude<ToastType, 'progress'>,
        dismissAfterMs = 3500
    ) => {
        // Transition the existing toast to the completion state in-place.
        // autoClose: false prevents the component's own countdown from double-firing.
        setToasts(prev => prev.map(t =>
            t.id === id
                ? { ...t, type, message, progress: undefined, autoClose: false }
                : t
        ));
        // Schedule auto-dismiss via context — sole controller since autoClose is false.
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, dismissAfterMs);
    };

    const removeToast = (id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    const setMaxToasts = (val: number) => {
        setMaxToastsState(val);
        localStorage.setItem('maxToasts', val.toString());
    };

    return (
        <ToastContext.Provider value={{ toasts, addToast, addProgressToast, updateToast, completeProgressToast, removeToast, maxToasts, setMaxToasts }}>
            {children}
        </ToastContext.Provider>
    );
};

export const useToasts = () => {
    const context = useContext(ToastContext);
    if (!context) throw new Error("useToasts must be used within ToastProvider");
    return context;
};
