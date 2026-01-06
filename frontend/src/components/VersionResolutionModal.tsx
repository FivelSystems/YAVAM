import { X, AlertTriangle, CheckCircle } from 'lucide-react';
import { VarPackage } from '../App';

interface VersionResolutionModalProps {
    isOpen: boolean;
    onClose: () => void;
    duplicates: VarPackage[];
    onResolve: (keepPkg: VarPackage) => void;
}

const VersionResolutionModal = ({ isOpen, onClose, duplicates, onResolve }: VersionResolutionModalProps) => {
    if (!isOpen) return null;

    // Sort duplicates by version (descending) if possible, or name
    const sorted = [...duplicates].sort((a, b) => {
        // Try to verify if version is comparable
        return b.fileName.localeCompare(a.fileName);
    });

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[80vh]">
                <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-yellow-900/20">
                    <h2 className="text-lg font-bold text-yellow-500 flex items-center gap-2">
                        <AlertTriangle size={20} />
                        Resolve Multiple Versions
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-4 overflow-y-auto flex-1 custom-scrollbar">
                    <p className="text-gray-300 mb-6 text-sm">
                        Multiple enabled versions of the same package detected. VaM may behave unpredictably.
                        <br />
                        Please select the version you want to <strong>Keep Enabled</strong>. All others will be disabled.
                    </p>

                    <div className="space-y-3">
                        {sorted.map((pkg) => (
                            <div key={pkg.filePath} className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 hover:border-blue-500/50 transition-colors flex justify-between items-center group">
                                <div>
                                    <div className="font-semibold text-white">{pkg.fileName}</div>
                                    <div className="text-xs text-gray-500 font-mono mt-1">{pkg.meta.version ? `v${pkg.meta.version}` : 'Unknown Version'} • {pkg.meta.creator}</div>
                                    <div className="text-xs text-gray-600 mt-1 truncate max-w-md">{pkg.filePath}</div>
                                </div>
                                <button
                                    onClick={() => onResolve(pkg)}
                                    className="px-4 py-2 bg-gray-700 hover:bg-blue-600 text-gray-200 hover:text-white rounded-lg flex items-center gap-2 transition-all font-medium text-sm border border-gray-600 hover:border-transparent"
                                >
                                    <CheckCircle size={16} />
                                    Keep This
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="p-4 border-t border-gray-700 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-400 hover:text-white transition-colors text-sm"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VersionResolutionModal;
