import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';


interface ScanOverlayProps {
    isCancelling?: boolean;
}

export const ScanOverlay: React.FC<ScanOverlayProps> = ({ isCancelling }) => {
    // Mode 1: Cancelling (BLOCKING)
    if (isCancelling) {
        return (
            <AnimatePresence>
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-wait">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        className="bg-gray-800 border-2 border-gray-600 rounded-xl p-8 flex flex-col items-center gap-4 shadow-2xl min-w-[320px]"
                    >
                        <div className="animate-spin text-gray-300">
                            <RefreshCw size={48} />
                        </div>
                        <div className="text-center">
                            <h3 className="text-xl font-bold text-white mb-2">Stopping Scan...</h3>
                            <p className="text-gray-400 text-sm">Please wait while the process terminates.</p>
                        </div>
                    </motion.div>
                </div>
            </AnimatePresence>
        );
    }

    // Mode 2: Scanning - NO OP (User requested removal of Toast)
    // Progress is now strictly dealt with in FilterToolbar.
    return null;
};

