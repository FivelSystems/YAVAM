import { X, AlertTriangle, CheckCircle } from 'lucide-react';
import { VarPackage } from '../../types';

interface VersionResolutionModalProps {
    isOpen: boolean;
    onClose: () => void;
    duplicates: VarPackage[];
    onResolve: (keepPkg: VarPackage) => void;
    onMerge: (duplicates: VarPackage[]) => void;
}

const VersionResolutionModal = ({ isOpen, onClose, duplicates, onResolve, onMerge }: VersionResolutionModalProps) => {
    if (!isOpen) return null;

    // 1. Check for Exact Duplicates (Same Version + Size + Hash if avail)
    // Group by unique key
    const exactGroups: Record<string, VarPackage[]> = {};
    duplicates.forEach(p => {
        const key = `${p.meta.version}-${p.size}`;
        if (!exactGroups[key]) exactGroups[key] = [];
        exactGroups[key].push(p);
    });

    const hasExactDuplicates = Object.values(exactGroups).some(g => g.length > 1);

    // Sort duplicates by version (descending)
    const sorted = [...duplicates].sort((a, b) => {
        // Parse versions as integers for VAM standard (1, 2, ..., 15)
        const vA = parseInt(a.meta.version);
        const vB = parseInt(b.meta.version);

        if (!isNaN(vA) && !isNaN(vB)) {
            return vB - vA; // Descending (15 before 3)
        }

        // Fallback for non-numeric versions
        return b.fileName.localeCompare(a.fileName, undefined, { numeric: true, sensitivity: 'base' });
    });

    // Heuristic for Latest Version (Keep)
    // Attempt to identify the "Best" candidate (highest version)
    // Here we just pick the top of sorted list?
    // User asked for "Only Latest" button.

    const handleOnlyLatest = () => {
        // Assume sorted[0] is latest?
        // Need robust sort.
        // Let's rely on simple string sort for now or better heuristic later.
        if (sorted.length > 0) {
            onResolve(sorted[0]);
        }
    };

    if (hasExactDuplicates) {
        return (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
                <div className="bg-gray-800 border border-purple-500/50 rounded-xl shadow-2xl max-w-md w-full flex flex-col p-6 text-center">
                    <div className="mx-auto bg-purple-500/20 p-4 rounded-full mb-4">
                        <CheckCircle size={48} className="text-purple-500" />
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">Duplicate Copies Detected</h2>
                    <p className="text-gray-400 mb-6 text-sm">
                        Before resolving version conflicts, we found <strong>exact duplicate files</strong>.
                        We recommend merging them first to clean up your library. This will keep one copy in the root and delete the rest.
                    </p>

                    <button
                        onClick={() => onMerge(duplicates)}
                        className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 px-4 rounded-lg transition-all transform hover:scale-[1.02] shadow-lg shadow-purple-900/20 mb-3"
                    >
                        Merge Duplicates First
                    </button>

                    <button onClick={onClose} className="text-gray-500 text-sm hover:text-gray-300 underline">
                        Cancel
                    </button>
                </div>
            </div>
        );
    }


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
                    <div className="flex justify-between items-end mb-4">
                        <p className="text-gray-300 text-sm">
                            Select the version to <strong>Keep Active</strong> (others will be disabled):
                        </p>
                        <button
                            onClick={handleOnlyLatest}
                            className="bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-xs px-3 py-1.5 rounded border border-blue-500/30 transition-colors uppercase font-bold tracking-wider"
                        >
                            Keep Latest Only
                        </button>
                    </div>

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
