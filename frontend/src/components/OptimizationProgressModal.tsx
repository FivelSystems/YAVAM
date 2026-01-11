import { motion } from 'framer-motion';
import { CheckCircle, AlertCircle, HardDrive, Loader2 } from 'lucide-react';
import clsx from 'clsx';

interface OptimizationProgressModalProps {
    isOpen: boolean;
    onClose: () => void;
    current: number;
    total: number;
    currentFile: string;
    spaceSaved: number; // in bytes
    completed: boolean;
    errors: string[];
}

export const OptimizationProgressModal = ({
    isOpen,
    onClose,
    current,
    total,
    currentFile,
    spaceSaved,
    completed,
    errors
}: OptimizationProgressModalProps) => {
    if (!isOpen) return null;

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-md">
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col"
            >
                <div className="p-6 flex flex-col items-center text-center">
                    {completed ? (
                        <>
                            <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mb-4">
                                <CheckCircle size={32} className="text-green-500" />
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-2">Optimization Complete</h2>
                            <p className="text-gray-400 mb-6">
                                The optimization process finished successfully.
                            </p>
                        </>
                    ) : (
                        <>
                            <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mb-4">
                                <Loader2 size={32} className="text-blue-500 animate-spin" />
                            </div>
                            <h2 className="text-xl font-bold text-white mb-2">Optimizing Library...</h2>
                            <p className="text-gray-400 text-sm mb-6 max-w-[80%] truncate" title={currentFile}>
                                {currentFile || "Preparing..."}
                            </p>
                        </>
                    )}

                    {/* Progress Bar (Only when running) */}
                    {!completed && (
                        <div className="w-full mb-2">
                            <div className="h-2 w-full bg-gray-700 rounded-full overflow-hidden">
                                <motion.div
                                    className="h-full bg-blue-500"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${total > 0 ? (current / total) * 100 : 0}%` }}
                                />
                            </div>
                            <div className="flex justify-between text-xs text-gray-400 mt-2">
                                <span>{current} processed</span>
                                <span>{total} total</span>
                            </div>
                        </div>
                    )}

                    {/* Stats Result (Only when completed) */}
                    {completed && (
                        <div className="grid grid-cols-2 gap-4 w-full mb-6">
                            <div className="bg-gray-700/50 rounded-lg p-4 flex flex-col items-center">
                                <HardDrive size={24} className="text-blue-400 mb-2" />
                                <span className="text-2xl font-bold text-white">{formatBytes(spaceSaved)}</span>
                                <span className="text-xs text-gray-400 uppercase tracking-wider">Disk Cleaned</span>
                            </div>
                            <div className="bg-gray-700/50 rounded-lg p-4 flex flex-col items-center">
                                <AlertCircle size={24} className={errors.length > 0 ? "text-red-400 mb-2" : "text-gray-500 mb-2"} />
                                <span className={clsx("text-2xl font-bold", errors.length > 0 ? "text-red-400" : "text-white")}>
                                    {errors.length}
                                </span>
                                <span className="text-xs text-gray-400 uppercase tracking-wider">Errors</span>
                            </div>
                        </div>
                    )}

                    {/* Error Log */}
                    {errors.length > 0 && completed && (
                        <div className="w-full bg-red-900/10 border border-red-500/20 rounded-lg p-3 text-left mb-6 max-h-32 overflow-y-auto">
                            <p className="text-xs font-bold text-red-400 mb-2">Error Log:</p>
                            {errors.map((e, i) => (
                                <div key={i} className="text-xs text-red-300 font-mono truncate">{e}</div>
                            ))}
                        </div>
                    )}

                    {completed && (
                        <button
                            onClick={onClose}
                            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors"
                        >
                            Okay, Close
                        </button>
                    )}
                </div>
            </motion.div>
        </div>
    );
};
