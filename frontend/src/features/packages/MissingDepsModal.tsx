import { X, AlertCircle } from 'lucide-react';

interface MissingDepsModalProps {
    isOpen: boolean;
    onClose: () => void;
    pkgName: string;
    missingDeps: string[];
}

const MissingDepsModal = ({ isOpen, onClose, pkgName, missingDeps }: MissingDepsModalProps) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl max-w-lg w-full flex flex-col max-h-[80vh]">
                <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <AlertCircle className="text-red-500" size={20} />
                        Missing Dependencies
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-4 overflow-y-auto flex-1 custom-scrollbar">
                    <p className="text-gray-300 mb-4 text-sm">
                        The package <span className="font-semibold text-white">{pkgName}</span> requires the following packages which are missing from your library:
                    </p>
                    <div className="space-y-2">
                        {missingDeps.map((dep, idx) => (
                            <div key={idx} className="bg-gray-900/50 p-2 rounded border border-gray-700 font-mono text-sm text-red-300 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                                {dep}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="p-4 border-t border-gray-700 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MissingDepsModal;
