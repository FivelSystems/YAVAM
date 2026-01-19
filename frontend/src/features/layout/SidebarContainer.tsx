import React, { PropsWithChildren } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';

interface SidebarContainerProps extends PropsWithChildren {
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
}

export const SidebarContainer: React.FC<SidebarContainerProps> = ({ isOpen, setIsOpen, children }) => {
    return (
        <>
            {/* Mobile Overlay Backdrop */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setIsOpen(false)}
                        className="fixed inset-0 bg-black/50 z-30 md:hidden"
                    />
                )}
            </AnimatePresence>

            {/* Sidebar Wrapper */}
            <div className={clsx(
                "z-40 transition-all duration-300 ease-in-out bg-gray-800 shrink-0 border-t border-gray-700",
                "md:relative md:h-full",
                // @ts-ignore
                typeof window !== 'undefined' && window.go ? "fixed left-0 top-8 bottom-0" : "fixed left-0 top-0 bottom-0",
                "shadow-2xl md:shadow-none md:top-0 md:bottom-auto",
                isOpen ? "w-64 translate-x-0" : "w-0 -translate-x-full md:translate-x-0 md:w-0 overflow-hidden"
            )}>
                <div className="w-64 h-full"> {/* Inner container to maintain width while parent animates */}
                    {children}
                </div>
            </div>
        </>
    );
};
