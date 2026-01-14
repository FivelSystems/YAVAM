import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles } from 'lucide-react';
import Markdown from 'react-markdown';

interface WhatsNewModalProps {
    isOpen: boolean;
    onClose: () => void;
    content: string;
    version: string;
}

export const WhatsNewModal: React.FC<WhatsNewModalProps> = ({ isOpen, onClose, content, version }) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60]"
                        onClick={onClose}
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="fixed inset-0 flex items-center justify-center z-[60] pointer-events-none p-4"
                    >
                        <div className="bg-gray-900 border border-gray-700/50 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col pointer-events-auto overflow-hidden">
                            {/* Header */}
                            <div className="flex items-center justify-between p-6 border-b border-gray-700 bg-gray-900/50 relative overflow-hidden">
                                {/* Decor */}
                                <div className="absolute top-0 left-0 w-full h-1 bg-blue-600/50" />

                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-blue-500/10 rounded-lg">
                                        <Sparkles className="text-blue-500" size={20} />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold text-gray-100">What's New in v{version}</h2>
                                    </div>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            {/* Content */}
                            <div className="p-6 overflow-y-auto custom-scrollbar">
                                <div className="prose prose-invert prose-blue max-w-none prose-p:text-gray-300 prose-headings:text-gray-100 prose-li:text-gray-300 prose-strong:text-blue-400 prose-a:text-blue-400">
                                    <Markdown>{content.replace(/<!--[\s\S]*?-->/g, '')}</Markdown>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="p-6 border-t border-gray-700 bg-gray-900/50 flex justify-end">
                                <button
                                    onClick={onClose}
                                    className="px-6 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-all active:scale-95"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};
