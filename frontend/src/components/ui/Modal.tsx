import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, HTMLMotionProps } from 'framer-motion';
import { X } from 'lucide-react';
import clsx from 'clsx';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

interface ModalProps extends Omit<HTMLMotionProps<"div">, "title"> {
    isOpen: boolean;
    onClose: () => void;
    title?: React.ReactNode;
    description?: string;
    size?: ModalSize;
    showCloseButton?: boolean;
    children: React.ReactNode;
    footer?: React.ReactNode;
}

const sizeClasses: Record<ModalSize, string> = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'w-screen h-[100dvh] rounded-none md:w-[95vw] md:h-[90vh] md:max-w-7xl md:max-h-[900px] md:rounded-2xl', // Mobile: Fullscreen, Desktop: Large Modal
};

const Modal = ({
    isOpen,
    onClose,
    title,
    description,
    size = 'md',
    showCloseButton = true,
    children,
    footer,
    className,
    ...props
}: ModalProps) => {

    // Lock body scroll
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    // Close on Escape
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
                <div className={clsx(
                    "fixed inset-0 z-50 flex items-center justify-center",
                    size === 'full' ? "p-0 md:p-4" : "p-4"
                )}>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className={clsx(
                            "bg-gray-800 border border-gray-700 shadow-2xl overflow-hidden flex flex-col relative z-50 w-full",
                            size === 'full' ? sizeClasses.full : `rounded-xl max-h-[90vh] ${sizeClasses[size]}`,
                            className
                        )}
                        {...props}
                    >
                        {/* Header */}
                        {(title || showCloseButton) && (
                            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-700/50 shrink-0">
                                {title && (
                                    <div>
                                        <h2 className="text-xl font-semibold text-white tracking-tight">{title}</h2>
                                        {description && <p className="text-sm text-gray-400 mt-1">{description}</p>}
                                    </div>
                                )}
                                {showCloseButton && (
                                    <button
                                        onClick={onClose}
                                        className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors -mr-2"
                                    >
                                        <X size={20} />
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Scrollable Content */}
                        <div className={clsx(
                            "flex-1 overflow-y-auto custom-scrollbar",
                            size === 'full' ? "p-0" : "p-6"
                        )}>
                            {children}
                        </div>

                        {/* Footer */}
                        {footer && (
                            <div className="p-4 sm:p-6 border-t border-gray-700/50 bg-gray-900/30 shrink-0 flex items-center justify-end gap-3">
                                {footer}
                            </div>
                        )}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
};

export default Modal;
