import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Download } from "lucide-react";

interface UpgradeModalProps {
    open: boolean;
    version: string;
    onUpdate: () => void;
    onCancel: () => void;
    downloading: boolean;
}

export function UpgradeModal({ open, version, onUpdate, onCancel, downloading }: UpgradeModalProps) {
    return (
        <AnimatePresence>
            {open && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl p-6 w-full max-w-md"
                    >
                        {!downloading ? (
                            <>
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="p-3 bg-blue-600/20 text-blue-500 rounded-full">
                                        <AlertCircle size={32} />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold text-white">Update Available</h2>
                                        <p className="text-gray-400 text-sm">A new version ({version}) is ready.</p>
                                    </div>
                                </div>
                                <p className="text-gray-300 mb-6">
                                    Would you like to download and install the update now? The application will restart automatically.
                                </p>
                                <div className="flex justify-end gap-3">
                                    <button
                                        onClick={onCancel}
                                        className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
                                    >
                                        Skip
                                    </button>
                                    <button
                                        onClick={onUpdate}
                                        className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-lg shadow-blue-900/50 transition-colors flex items-center gap-2"
                                    >
                                        <Download size={18} />
                                        Update Now
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-col items-center py-6">
                                <div className="relative w-16 h-16 mb-4">
                                    <div className="absolute inset-0 border-4 border-gray-700 rounded-full"></div>
                                    <div className="absolute inset-0 border-4 border-t-blue-500 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin"></div>
                                </div>
                                <h3 className="text-xl font-bold text-white mb-2">Downloading Update...</h3>
                                <p className="text-gray-400 text-sm">Please wait, this might take a moment.</p>
                            </div>
                        )}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
