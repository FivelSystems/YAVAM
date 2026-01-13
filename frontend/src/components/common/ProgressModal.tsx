import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';

interface ProgressModalProps {
    isOpen: boolean;
    current: number;
    total: number;
    message?: string;
}

export const ProgressModal: React.FC<ProgressModalProps> = ({ isOpen, current, total, message = "Scanning Library..." }) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-gray-900 border border-gray-700 rounded-lg p-6 shadow-xl w-80 flex flex-col items-center"
                    >
                        <Loader2 className="w-10 h-10 text-cyan-400 animate-spin mb-4" />
                        <h3 className="text-lg font-semibold text-white mb-2">{message}</h3>
                        <div className="w-full bg-gray-800 rounded-full h-2.5 mb-2 overflow-hidden">
                            <motion.div
                                className="bg-cyan-500 h-2.5 rounded-full"
                                initial={{ width: 0 }}
                                animate={{ width: `${(current / Math.max(total, 1)) * 100}%` }}
                                transition={{ duration: 0.2 }}
                            />
                        </div>
                        <p className="text-sm text-gray-400 font-mono">
                            {current} / {total}
                        </p>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
