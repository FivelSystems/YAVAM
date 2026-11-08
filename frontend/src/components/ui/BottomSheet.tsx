import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';

interface BottomSheetProps {
    /** Closing plays the exit animation rather than unmounting the sheet. */
    isOpen: boolean;
    title: string;
    onClose: () => void;
    children: React.ReactNode;
}

/**
 * Shell of every mobile bottom sheet: portal, backdrop, drag handle, title,
 * body-scroll lock and Escape/backdrop dismissal. `ActionSheet` and the
 * pagination jump sheet only differ in the body they put inside.
 */
export const BottomSheet = ({ isOpen, title, onClose, children }: BottomSheetProps) => {
    useEffect(() => {
        if (!isOpen) return;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-end justify-center"
                    role="dialog"
                    aria-modal="true"
                    aria-label={title}
                >
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
                    />

                    <motion.div
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                        className="relative z-10 w-full max-w-md bg-gray-800 border-t border-gray-700 rounded-t-2xl shadow-2xl max-h-[85vh] flex flex-col"
                    >
                        <div className="px-4 pt-3 pb-3 border-b border-gray-700/50 shrink-0">
                            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-600" />
                            <h2 className="text-sm font-semibold text-gray-200 truncate">{title}</h2>
                        </div>
                        {children}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
};

export default BottomSheet;
