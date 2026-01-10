import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Sparkles, Layers, AlertTriangle, Check } from 'lucide-react';
import clsx from 'clsx';
import { VarPackage } from '../App';

interface OptimizationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (merge: boolean, resolutionStrategy: 'latest' | 'manual' | 'none', manualPlan: ManualPlan) => void;
    mergePlan: { keep: VarPackage, delete: VarPackage[] }[];
    resolveGroups: { id: string, packages: VarPackage[] }[];
}

export type ManualPlan = Record<string, string>; // PackageID -> SelectedFilePath (or "none")

export const OptimizationModal = ({ isOpen, onClose, onConfirm, mergePlan, resolveGroups }: OptimizationModalProps) => {
    const [enableMerge, setEnableMerge] = useState(true);
    const [resolutionStrategy, setResolutionStrategy] = useState<'latest' | 'manual' | 'none'>('latest');
    const [manualSelections, setManualSelections] = useState<ManualPlan>({});

    // Derived Stats
    const mergeCount = mergePlan.reduce((acc, g) => acc + g.delete.length, 0);
    const resolveCount = resolveGroups.length;

    // Initialize/Reset Manual Selections
    useEffect(() => {
        if (isOpen) {
            const initial: ManualPlan = {};
            resolveGroups.forEach(g => {
                // Default to latest (first in sorted list usually, but let's sort to be sure)
                const sorted = [...g.packages].sort((a, b) => {
                    const vA = parseInt(a.meta.version) || 0;
                    const vB = parseInt(b.meta.version) || 0;
                    return vB - vA;
                });
                if (sorted.length > 0) {
                    initial[g.id] = sorted[0].filePath;
                }
            });
            setManualSelections(initial);
            setEnableMerge(true);
            setResolutionStrategy('latest');
        }
    }, [isOpen, resolveGroups]);


    // Dynamic Title
    const isSingleMode = (resolveGroups.length <= 1 && mergePlan.length <= 1) && (resolveGroups.length + mergePlan.length > 0);
    const title = isSingleMode
        ? (resolveGroups.length > 0 ? `Resolve ${resolveGroups[0].packages[0].meta.packageName}` : "Merge Duplicates")
        : (mergeCount > 0 && resolveGroups.length === 0 ? "Merge Duplicates" : "Optimize Library");

    if (!isOpen) return null;

    // Single Package Streamlined View
    // Single Package Streamlined View
    if (isSingleMode) {
        const group = resolveGroups.length > 0 ? resolveGroups[0] : null;

        let sorted: VarPackage[] = [];
        let currentSelection = "";

        if (group) {
            sorted = [...group.packages].sort((a, b) => {
                const vA = parseInt(a.meta.version) || 0;
                const vB = parseInt(b.meta.version) || 0;
                return vB - vA;
            });
            currentSelection = manualSelections[group.id] || sorted[0].filePath;
        }

        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg flex flex-col"
                >
                    <div className="p-6 border-b border-gray-700 flex items-center justify-between">
                        <h2 className="text-xl font-bold text-white">
                            {group ? `Resolve ${group.packages[0].meta.packageName}` : "Merge Duplicates"}
                        </h2>
                        <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={24} /></button>
                    </div>

                    <div className="p-6 space-y-6">
                        {/* Merge Section */}
                        {mergeCount > 0 && (
                            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <Layers size={18} className="text-blue-400" />
                                        <h3 className="text-sm font-bold text-blue-300">Exact Duplicates Found</h3>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input type="checkbox" className="sr-only peer" checked={enableMerge} onChange={(e) => setEnableMerge(e.target.checked)} />
                                        <div className="w-9 h-5 bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                                    </label>
                                </div>
                                <p className="text-xs text-gray-400">
                                    {mergeCount} identical copies of this package were found.
                                    {enableMerge ? " They will be merged." : " They will be ignored."}
                                </p>
                            </div>
                        )}

                        {/* Version Resolution Section */}
                        {group && (
                            <div className="space-y-4">
                                <p className="text-sm text-gray-300">
                                    Select the version you want to keep enabled. All others will be disabled.
                                </p>
                                <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                                    {sorted.map(p => (
                                        <label key={p.filePath} className={clsx(
                                            "flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all",
                                            currentSelection === p.filePath
                                                ? "bg-blue-600/20 border-blue-500 ring-1 ring-blue-500"
                                                : "bg-gray-700/50 border-gray-600 hover:bg-gray-700 hover:border-gray-500"
                                        )}>
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="radio"
                                                    name="versionSelect"
                                                    value={p.filePath}
                                                    checked={currentSelection === p.filePath}
                                                    onChange={() => setManualSelections({ [group.id]: p.filePath })}
                                                    className="w-4 h-4 text-blue-500 bg-gray-700 border-gray-500 focus:ring-blue-600 focus:ring-offset-gray-800"
                                                />
                                                <div className="flex flex-col">
                                                    <span className="text-white font-medium">Version {p.meta.version}</span>
                                                    <span className="text-xs text-gray-400">{(p.size / 1024 / 1024).toFixed(2)} MB • {p === sorted[0] ? "Latest" : "Older"}</span>
                                                </div>
                                            </div>
                                            {p === sorted[0] && <span className="bg-green-500/20 text-green-400 px-2 py-0.5 rounded text-xs font-bold">Latest</span>}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="p-6 border-t border-gray-700 bg-gray-800 rounded-b-xl flex justify-end gap-3">
                        <button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-medium">Cancel</button>
                        <button
                            onClick={() => onConfirm(enableMerge, 'manual', manualSelections)} // Use enableMerge state
                            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center gap-2"
                        >
                            <Check size={18} />
                            Apply Fixes
                        </button>
                    </div>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden"
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-700 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="bg-purple-500/20 p-2 rounded-lg">
                            <Sparkles size={24} className="text-purple-400" />
                        </div>
                        <h2 className="text-xl font-bold text-white">{title}</h2>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Content - Scrollable */}
                <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">

                    {/* Section 1: Merge Duplicates */}
                    <div className="space-y-4">
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                                <div className="bg-gray-700 p-2 rounded-lg">
                                    <Layers size={20} className="text-blue-400" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-medium text-white">Merge Exact Duplicates</h3>
                                    <p className="text-sm text-gray-400">Consolidate identical files to the library root.</p>
                                </div>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" className="sr-only peer" checked={enableMerge} onChange={(e) => setEnableMerge(e.target.checked)} />
                                <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                        </div>

                        {enableMerge && mergeCount > 0 && (
                            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 flex items-start gap-3">
                                <div className="mt-1"><AlertTriangle size={16} className="text-blue-400" /></div>
                                <div className="text-sm text-gray-300">
                                    <span className="font-semibold text-blue-300">{mergeCount} duplicate files</span> will be deleted.
                                    <br />
                                    {mergePlan.length} unique packages will remain in the library root.
                                </div>
                            </div>
                        )}
                        {enableMerge && mergeCount === 0 && (
                            <div className="p-4 text-sm text-gray-500 italic text-center border border-gray-700 border-dashed rounded-lg">
                                No exact duplicates found.
                            </div>
                        )}
                    </div>

                    <div className="h-px bg-gray-700" />

                    {/* Section 2: Version Resolution */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="bg-gray-700 p-2 rounded-lg">
                                    <Check size={20} className="text-green-400" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-medium text-white">Resolve Conflicts</h3>
                                    <p className="text-sm text-gray-400">Handle multiple versions of the same package.</p>
                                </div>
                            </div>

                            <select
                                value={resolutionStrategy}
                                onChange={(e) => setResolutionStrategy(e.target.value as any)}
                                className="bg-gray-700 border border-gray-600 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 outline-none"
                            >
                                <option value="latest">Keep Latest (Auto)</option>
                                <option value="manual">Let me pick</option>
                                <option value="none">Do nothing</option>
                            </select>
                        </div>

                        {resolutionStrategy !== 'none' && resolveCount > 0 && (
                            <div className="bg-gray-900/50 rounded-lg border border-gray-700 overflow-hidden">
                                {resolutionStrategy === 'latest' && (
                                    <div className="p-4 text-sm text-gray-300">
                                        Found <span className="text-white font-bold">{resolveCount}</span> conflict groups.
                                        <br />
                                        <span className="text-green-400 font-medium">Latest versions</span> will be kept enabled.
                                        <br />
                                        All older versions will be disabled.
                                    </div>
                                )}

                                {resolutionStrategy === 'manual' && (
                                    <div className="divide-y divide-gray-700 max-h-60 overflow-y-auto custom-scrollbar">
                                        {resolveGroups.map(group => {
                                            // Sort: high version first
                                            const sorted = [...group.packages].sort((a, b) => {
                                                const vA = parseInt(a.meta.version) || 0;
                                                const vB = parseInt(b.meta.version) || 0;
                                                return vB - vA;
                                            });
                                            const selection = manualSelections[group.id] || "none";

                                            return (
                                                <div key={group.id} className="p-3 flex items-center justify-between gap-4">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="text-sm font-medium text-white truncate">{group.packages[0].meta.packageName}</div>
                                                        <div className="text-xs text-gray-500 truncate">{group.packages[0].meta.creator}</div>
                                                    </div>
                                                    <select
                                                        value={selection}
                                                        onChange={(e) => setManualSelections(prev => ({ ...prev, [group.id]: e.target.value }))}
                                                        className="bg-gray-800 border border-gray-600 text-xs text-white rounded px-2 py-1 outline-none w-40"
                                                    >
                                                        <option value="none">Do not resolve</option>
                                                        {sorted.map(p => (
                                                            <option key={p.filePath} value={p.filePath}>
                                                                v{p.meta.version} {p === sorted[0] ? "(Latest)" : ""}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                        {resolutionStrategy !== 'none' && resolveCount === 0 && (
                            <div className="p-4 text-sm text-gray-500 italic text-center border border-gray-700 border-dashed rounded-lg">
                                No version conflicts found.
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-700 bg-gray-800 shrink-0 flex justify-end gap-3 rounded-b-xl">
                    <div className="mr-auto text-xs text-gray-500 flex flex-col justify-center hidden sm:flex">
                        <span>{mergeCount > 0 && enableMerge ? `• Merging ${mergeCount} files` : "• No merges"}</span>
                        <span>{resolutionStrategy !== 'none' && resolveCount > 0 ? `• Resolving ${resolveCount} groups` : "• No resolutions"}</span>
                    </div>

                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-medium transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onConfirm(enableMerge, resolutionStrategy, manualSelections)}
                        className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold shadow-lg shadow-purple-900/30 transition-all transform active:scale-95 flex items-center gap-2"
                    >
                        <Sparkles size={18} />
                        Optimize Library
                    </button>
                </div>
            </motion.div>
        </div>
    );
};
