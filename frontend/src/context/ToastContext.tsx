import React, { createContext, useContext, useState } from 'react';
import { ToastItem, ToastType } from '../components/ui/Toast';

interface ToastContextType {
    toasts: ToastItem[];
    addToast: (message: string, type?: ToastType, action?: () => void) => void;
    removeToast: (id: string) => void;
    maxToasts: number;
    setMaxToasts: (val: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [maxToasts, setMaxToastsState] = useState(() => parseInt(localStorage.getItem('maxToasts') || '5'));
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

    const setMaxToasts = (val: number) => {
        setMaxToastsState(val);
        localStorage.setItem('maxToasts', val.toString());
    };

    return (
        <ToastContext.Provider value={{ toasts, addToast, removeToast, maxToasts, setMaxToasts }}>
            {children}
        </ToastContext.Provider>
    );
};

export const useToasts = () => {
    const context = useContext(ToastContext);
    if (!context) throw new Error("useToasts must be used within ToastProvider");
    return context;
};
