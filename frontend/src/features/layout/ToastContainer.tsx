import React from 'react';
import { AnimatePresence } from 'framer-motion';
import { Toast } from '../../components/ui/Toast';
import { useToasts } from '../../context/ToastContext';

export const ToastContainer: React.FC = () => {
    const { toasts, removeToast } = useToasts();

    return (
        <div className="fixed bottom-20 right-4 z-50 flex flex-col items-end pointer-events-none">
            <AnimatePresence>
                {toasts.map(toast => (
                    <Toast key={toast.id} toast={toast} onRemove={removeToast} />
                ))}
            </AnimatePresence>
        </div>
    );
};
