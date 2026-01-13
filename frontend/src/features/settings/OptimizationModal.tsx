import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Sparkles, Layers, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import { VarPackage } from '../../types';

interface OptimizationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (merge: boolean, resolutionStrategy: 'latest' | 'manual' | 'none' | 'delete-older', manualPlan: ManualPlan) => void;
    mergePlan: { keep: VarPackage, delete: VarPackage[] }[];
    resolveGroups: { id: string, packages: VarPackage[] }[];
    targetPackage?: VarPackage;
}

export type ManualPlan = Record<string, string>; // PackageID -> SelectedFilePath (or "none")

export const OptimizationModal = ({ isOpen, onClose, onConfirm, mergePlan, resolveGroups, targetPackage }: OptimizationModalProps) => {
    // Format Helper
    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const [enableMerge, setEnableMerge] = useState(true);
    const [resolutionStrategy, setResolutionStrategy] = useState<'latest' | 'manual' | 'none' | 'delete-older'>('latest');
    const [manualSelections, setManualSelections] = useState<ManualPlan>({});
    const [activeTab, setActiveTab] = useState<'merge' | 'versions' | 'review' | null>(null);

    // Derived Stats
    const mergeCount = mergePlan.reduce((acc, g) => acc + g.delete.length, 0);
    const resolveCount = resolveGroups.length;

    // Calculate Potential Savings (Merge)
    const potentialMergeSavings = mergePlan.reduce((acc, g) => {
        return acc + g.delete.reduce((sum, d) => sum + (d.size || 0), 0);
    }, 0);

    // Calculate Savings from Versions (Approximate for 'delete-older')
    const potentialVersionSavings = resolveGroups.reduce((acc, group) => {
        if (resolutionStrategy === 'delete-older' || resolutionStrategy === 'latest') {
            // Logic: All but latest are "removed" (deleted or disabled)
            // For disk space, only 'delete-older' counts.
            if (resolutionStrategy !== 'delete-older') return acc;

            const sorted = [...group.packages].sort((a, b) => (parseInt(b.meta.version) || 0) - (parseInt(a.meta.version) || 0));
            // Keep sorted[0], delete rest
            return acc + sorted.slice(1).reduce((sum, p) => sum + (p.size || 0), 0);
        }
        return acc;
    }, 0);

    const totalExpectedSavings = (enableMerge ? potentialMergeSavings : 0) + potentialVersionSavings;

    // Initialize/Reset
    useEffect(() => {
        if (isOpen) {
            const initial: ManualPlan = {};
            resolveGroups.forEach(g => {
                const sorted = [...g.packages].sort((a, b) => (parseInt(b.meta.version) || 0) - (parseInt(a.meta.version) || 0));
                if (sorted.length > 0) initial[g.id] = sorted[0].filePath;
            });
            setManualSelections(initial);
            setEnableMerge(mergeCount > 0); // Default to true only if duplicates exist
            setResolutionStrategy('latest');

            // Set Initial Tab
            if (mergeCount > 0) setActiveTab('merge');
            else if (resolveCount > 0) setActiveTab('versions');
            else setActiveTab('review');
        }
    }, [isOpen, resolveGroups, mergeCount, resolveCount]);

    if (!isOpen) return null;

    const contextLabel = targetPackage ? "Single Package" : `Library Scope (${mergePlan.length + resolveGroups.length} Issues)`;

    // Render Preview for Latest/Delete
    const renderVersionPreview = () => {
        if (resolveGroups.length === 0) return <p className="text-gray-500 italic text-sm">No version conflicts found.</p>;

        return (
            <div className="bg-gray-900/50 rounded-lg border border-gray-700 max-h-40 overflow-y-auto custom-scrollbar p-2">
                <p className="text-xs font-bold text-gray-500 uppercase px-2 mb-1 sticky top-0 bg-gray-900/90 backdrop-blur">
                    {resolutionStrategy === 'delete-older' ? "Versions to be DELETED:" : "Versions to be DISABLED:"}
                </p>
                {resolveGroups.map((group, idx) => {
                    const sorted = [...group.packages].sort((a, b) => (parseInt(b.meta.version) || 0) - (parseInt(a.meta.version) || 0));
                    const kept = sorted[0]; // Latest
                    const others = sorted.slice(1);
                    if (others.length === 0) return null;

                    return (
                        <div key={idx} className="text-xs text-gray-400 px-2 py-1 border-b border-gray-700/50 last:border-0 truncate">
                            <span className="text-white">{group.packages[0].meta.packageName}</span>
                            <span className="text-gray-500 ml-1">keeping v{kept.meta.version},</span>
                            <span className={clsx("ml-1 font-bold", resolutionStrategy === 'delete-older' ? "text-red-400" : "text-yellow-500")}>
                                {resolutionStrategy === 'delete-older' ? "deleting" : "disabling"} {others.map(p => `v${p.meta.version}`).join(', ')}
                            </span>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden"
            >
                {/* Context Banner */}
                <div className="bg-gradient-to-r from-blue-900/40 to-purple-900/40 border-b border-gray-700 p-3 px-6 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium text-blue-200">
                        <Sparkles size={16} />
                        <span className="uppercase tracking-wide text-xs opacity-70">Optimization Context:</span>
                        <span className="text-white">{contextLabel}</span>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 border-b border-gray-700 bg-gray-800">
                    <h2 className="text-2xl font-bold text-white mb-1">
                        {targetPackage ? `Fix ${targetPackage.meta.packageName}` : "Optimize Library"}
                    </h2>
                    <p className="text-gray-400 text-sm">Review and apply fixes to your library.</p>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-gray-900/30">

                    {/* Tab 1: Merging */}
                    <div className={clsx("border rounded-xl transition-all overflow-hidden", activeTab === 'merge' ? "border-blue-500/50 bg-gray-800" : "border-gray-700 bg-gray-800/50")}>
                        <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-700/50 transition-colors" onClick={() => setActiveTab(activeTab === 'merge' ? null : 'merge')}>
                            <div className="flex items-center gap-3">
                                <div className={clsx("p-2 rounded-lg", activeTab === 'merge' ? "bg-blue-500/20 text-blue-400" : "bg-gray-700 text-gray-400")}><Layers size={20} /></div>
                                <div><h3 className="text-base font-bold text-white">Merge Duplicates</h3><p className="text-xs text-gray-400">Consolidate exact copies</p></div>
                            </div>
                            <div className="flex items-center gap-3">
                                {mergeCount > 0 ? (
                                    <div onClick={(e) => e.stopPropagation()}>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input type="checkbox" className="sr-only peer" checked={enableMerge} onChange={(e) => setEnableMerge(e.target.checked)} />
                                            <div className="w-9 h-5 bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                                        </label>
                                    </div>
                                ) : <span className="text-xs text-gray-500 italic">No duplicates</span>}
                            </div>
                        </div>
                        {activeTab === 'merge' && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-gray-700 p-4 bg-gray-900/50">
                                {mergeCount > 0 ? (
                                    <div className="flex flex-col gap-4">
                                        <div className="flex items-center gap-4">
                                            <div className="bg-green-500/10 p-3 rounded-full"><Sparkles size={24} className="text-green-400" /></div>
                                            <div>
                                                <p className="text-white font-medium">Space to be saved: <span className="text-green-400 font-bold">{formatBytes(potentialMergeSavings)}</span></p>
                                                <p className="text-sm text-gray-400">{mergeCount} duplicate files defined in {mergePlan.length} groups will be moved to the Recycle Bin. One copy of each will be preserved in the root.</p>
                                            </div>
                                        </div>
                                        <div className="bg-gray-800 rounded-lg border border-gray-700 max-h-40 overflow-y-auto custom-scrollbar p-2">
                                            <p className="text-xs font-bold text-gray-500 uppercase px-2 mb-1 sticky top-0 bg-gray-800">Packages affected:</p>
                                            {mergePlan.map((group, idx) => (
                                                <div key={idx} className="text-xs text-gray-300 px-2 py-1 border-b border-gray-700/50 last:border-0 truncate">
                                                    {group.keep.meta.packageName} <span className="text-gray-500">v{group.keep.meta.version} ({group.delete.length} duplicates)</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (<p className="text-gray-500 italic text-center text-sm">No exact duplicates found.</p>)}
                            </motion.div>
                        )}
                    </div>

                    {/* Tab 2: Versions */}
                    <div className={clsx("border rounded-xl transition-all overflow-hidden", activeTab === 'versions' ? "border-purple-500/50 bg-gray-800" : "border-gray-700 bg-gray-800/50")}>
                        <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-700/50 transition-colors" onClick={() => setActiveTab(activeTab === 'versions' ? null : 'versions')}>
                            <div className="flex items-center gap-3">
                                <div className={clsx("p-2 rounded-lg", activeTab === 'versions' ? "bg-purple-500/20 text-purple-400" : "bg-gray-700 text-gray-400")}><Layers size={20} /></div>
                                <div><h3 className="text-base font-bold text-white">Versions</h3><p className="text-xs text-gray-400">Resolve package conflicts</p></div>
                            </div>
                            <div className="flex items-center gap-3">
                                {resolveCount > 0 && <span className="bg-gray-700 text-gray-300 text-xs px-2 py-1 rounded-full">{resolveCount} Conflicts</span>}
                            </div>
                        </div>
                        {activeTab === 'versions' && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-gray-700 p-4 bg-gray-900/50">
                                <div className="mb-4">
                                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Resolution Strategy</label>
                                    <select value={resolutionStrategy} onChange={(e) => setResolutionStrategy(e.target.value as any)} className="w-full bg-gray-800 border border-gray-600 text-white text-sm rounded-lg focus:ring-purple-500 focus:border-purple-500 block p-2.5 outline-none">
                                        <option value="latest">Keep Latest (Disable Others)</option>
                                        <option value="delete-older" className="text-red-400 font-bold">Keep Latest (DELETE Others)</option>
                                        <option value="manual">Manual Selection</option>
                                        <option value="none">Do Nothing</option>
                                    </select>
                                </div>
                                <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3 mb-4">
                                    <div className="flex gap-2 text-sm text-gray-300">
                                        <AlertTriangle size={16} className="text-purple-400 shrink-0 mt-0.5" />
                                        <div>
                                            {resolutionStrategy === 'latest' && "Older versions will be DISABLED. Only the latest version will remain active."}
                                            {resolutionStrategy === 'delete-older' && <span className="text-red-200">Older versions will be DELETED permanently to save space. Careful!</span>}
                                            {resolutionStrategy === 'manual' && "Manually select which version to keep. Non-selected versions will be disabled."}
                                            {resolutionStrategy === 'none' && "No changes will be made."}
                                        </div>
                                    </div>
                                </div>

                                {/* Previews */}
                                {(resolutionStrategy === 'latest' || resolutionStrategy === 'delete-older') && renderVersionPreview()}

                                {resolutionStrategy === 'manual' && resolveCount > 0 && (
                                    <div className="divide-y divide-gray-700 max-h-60 overflow-y-auto custom-scrollbar border border-gray-700 rounded-lg bg-gray-800">
                                        {resolveGroups.map(group => {
                                            const sorted = [...group.packages].sort((a, b) => (parseInt(b.meta.version) || 0) - (parseInt(a.meta.version) || 0));
                                            const selection = manualSelections[group.id] || "none";
                                            return (
                                                <div key={group.id} className="p-3 flex items-center justify-between gap-4">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="text-sm font-medium text-white truncate">{group.packages[0].meta.packageName}</div>
                                                        <div className="text-xs text-gray-500 truncate">{group.packages[0].meta.creator}</div>
                                                    </div>
                                                    <select value={selection} onChange={(e) => setManualSelections(prev => ({ ...prev, [group.id]: e.target.value }))} className="bg-gray-700 border border-gray-600 text-xs text-white rounded px-2 py-1 outline-none w-40">
                                                        <option value="none">Ignore</option>
                                                        {sorted.map(p => (<option key={p.filePath} value={p.filePath}>v{p.meta.version} {p === sorted[0] ? "(Latest)" : ""}</option>))}
                                                    </select>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </div>

                    {/* Tab 3: Review (New) */}
                    <div className={clsx("border rounded-xl transition-all overflow-hidden", activeTab === 'review' ? "border-green-500/50 bg-gray-800" : "border-gray-700 bg-gray-800/50")}>
                        <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-700/50 transition-colors" onClick={() => setActiveTab(activeTab === 'review' ? null : 'review')}>
                            <div className="flex items-center gap-3">
                                <div className={clsx("p-2 rounded-lg", activeTab === 'review' ? "bg-green-500/20 text-green-400" : "bg-gray-700 text-gray-400")}><Sparkles size={20} /></div>
                                <div><h3 className="text-base font-bold text-white">Review & Optimize</h3><p className="text-xs text-gray-400">Confirm and execute</p></div>
                            </div>
                            <div className="text-right">
                                <span className="block text-green-400 font-bold text-sm">Save {formatBytes(totalExpectedSavings)}</span>
                            </div>
                        </div>
                        {activeTab === 'review' && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-gray-700 p-4 bg-gray-900/50">
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-gray-800 p-3 rounded-lg border border-gray-700 text-center">
                                            <div className="text-2xl font-bold text-white">{enableMerge ? mergeCount : 0}</div>
                                            <div className="text-xs text-gray-400 uppercase">Files to Merge</div>
                                        </div>
                                        <div className="bg-gray-800 p-3 rounded-lg border border-gray-700 text-center">
                                            <div className="text-2xl font-bold text-white">{resolutionStrategy !== 'none' ? resolveCount : 0}</div>
                                            <div className="text-xs text-gray-400 uppercase">Conflicts Resolved</div>
                                        </div>
                                    </div>

                                    <div className="text-sm text-gray-300 space-y-2">
                                        <p>You are about to:</p>
                                        <ul className="list-disc pl-5 space-y-1">
                                            <li>{enableMerge ? `Merge and delete ${mergeCount} exact duplicate files.` : "Skip merging exact duplicates."}</li>
                                            <li>
                                                {resolutionStrategy === 'latest' && "Disable older versions, keeping only the latest."}
                                                {resolutionStrategy === 'delete-older' && <span className="text-red-300 font-bold">PERMANENTLY DELETE older versions, keeping only the latest.</span>}
                                                {resolutionStrategy === 'manual' && "Apply manual version selections."}
                                                {resolutionStrategy === 'none' && "Skip version conflict resolution."}
                                            </li>
                                        </ul>
                                    </div>

                                    <button onClick={() => onConfirm(enableMerge, resolutionStrategy, manualSelections)} className="w-full py-4 mt-2 rounded-lg bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-500 hover:to-blue-500 text-white font-bold shadow-lg flex items-center justify-center gap-2 transform transition-transform active:scale-95">
                                        <Sparkles size={20} />
                                        Confirm Optimization ({formatBytes(totalExpectedSavings)})
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </div>
                </div>

                <div className="p-6 border-t border-gray-700 bg-gray-800 flex justify-between gap-3 shrink-0 rounded-b-xl">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-medium">Cancel</button>
                    {activeTab !== 'review' && (
                        <button onClick={() => setActiveTab('review')} className="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold">
                            Review Changes
                        </button>
                    )}
                </div>
            </motion.div>
        </div>
    );
};
