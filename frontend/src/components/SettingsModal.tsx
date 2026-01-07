import { X, FolderOpen } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    downloadPath: string;
    onBrowseDownload: () => void;
    onResetDownload: () => void;
    libraryPath: string;
    onBrowseLibrary: () => void;
}

const SettingsModal = ({ isOpen, onClose, downloadPath, onBrowseDownload, onResetDownload, libraryPath, onBrowseLibrary }: SettingsModalProps) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-md border border-gray-700 overflow-hidden"
                    >
                        <div className="flex items-center justify-between p-4 border-b border-gray-700">
                            <h3 className="text-lg font-semibold text-white">Settings</h3>
                            <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Library Folder */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-300">Library Folder</label>
                                <p className="text-xs text-gray-500">Location of your VaM AddonPackages.</p>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={libraryPath || "Not Set"}
                                        readOnly
                                        className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                    />
                                    <button
                                        onClick={onBrowseLibrary}
                                        className="bg-gray-700 hover:bg-gray-600 text-white p-2 rounded-lg transition-colors border border-gray-600"
                                        title="Select Library Folder"
                                    >
                                        <FolderOpen size={18} />
                                    </button>
                                </div>
                            </div>

                            {/* Download Path */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-300">Default Download Path</label>
                                <p className="text-xs text-gray-500">Files will be exported to this folder.</p>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={downloadPath || "User Downloads Folder"}
                                        readOnly
                                        className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                    />
                                    <button
                                        onClick={onBrowseDownload}
                                        className="bg-gray-700 hover:bg-gray-600 text-white p-2 rounded-lg transition-colors border border-gray-600"
                                        title="Select Download Folder"
                                    >
                                        <FolderOpen size={18} />
                                    </button>
                                </div>
                                <div className="flex justify-end">
                                    <button
                                        onClick={onResetDownload}
                                        className="text-xs text-blue-400 hover:text-blue-300 underline"
                                    >
                                        Reset to Default
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 bg-gray-900/50 border-t border-gray-700 flex justify-end">
                            <button
                                onClick={onClose}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors"
                            >
                                Done
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default SettingsModal;
