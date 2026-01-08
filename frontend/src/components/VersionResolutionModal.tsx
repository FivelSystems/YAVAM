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
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
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
                        Multiple enabled versions detected. Select the one to <strong>Keep Enabled</strong>:<br />
                        <span className="text-gray-500 text-xs">(Identical copies will be automatically merged/deleted)</span>
                    </p>

                    <div className="space-y-3">
                        {sorted.map((pkg) => {
                            const isIdenticalToOthers = sorted.some(p => p.filePath !== pkg.filePath && p.size === pkg.size && p.meta.version === pkg.meta.version);

                            return (
                                <div
                                    key={pkg.filePath}
                                    onClick={() => onResolve(pkg)}
                                    className="bg-gray-900/50 p-3 rounded-lg border border-gray-700 hover:border-blue-500 hover:bg-gray-800/80 transition-all cursor-pointer flex justify-between items-center group active:scale-[0.98]"
                                >
                                    <div className="min-w-0 pr-4">
                                        <div className="font-bold text-white truncate text-base flex items-center gap-2">
                                            {pkg.meta.packageName || pkg.fileName}
                                            {isIdenticalToOthers && (
                                                <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded border border-purple-500/30">
                                                    Duplicate
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                                            <span className="bg-gray-800 px-1.5 py-0.5 rounded text-gray-300 border border-gray-700">
                                                v{pkg.meta.version || '?'}
                                            </span>
                                            <span className="truncate">{pkg.meta.creator}</span>
                                            <span className="text-gray-600">•</span>
                                            <span className="font-mono text-gray-500">{(pkg.size / 1024 / 1024).toFixed(2)} MB</span>
                                        </div>
                                        <div className="text-[10px] text-gray-600 mt-1 truncate font-mono hidden sm:block">
                                            {pkg.filePath}
                                        </div>
                                    </div>
                                    <div className="shrink-0 text-gray-600 group-hover:text-blue-500 transition-colors">
                                        <CheckCircle size={24} />
                                    </div>
                                </div>
                            );
                        })}
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
