import { useState, useEffect, useMemo } from 'react';
import { Trash2, AlertTriangle, HardDrive, X, ChevronDown, Check, ShieldAlert } from 'lucide-react';
import clsx from 'clsx';
import { usePackageContext } from '../../context/PackageContext';

// Helper to format bytes
const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const getBasename = (path: string) => path.split(/[/\\]/).pop() || path;

interface DeletePackageModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (files: string[]) => Promise<void>;
    packagesToDelete: string[];
}

type DeleteMode = 'keep' | 'purge_unused' | 'purge_all';

export const DeletePackageModal = ({ isOpen, onClose, onConfirm, packagesToDelete }: DeletePackageModalProps) => {
    const { packages } = usePackageContext();
    const [mode, setMode] = useState<DeleteMode>('keep');
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [analyzing, setAnalyzing] = useState(false);

    // Impact Results
    const [impactMap, setImpactMap] = useState({
        safe: [] as string[],
        unsafe: [] as string[]
    });

    // Run Analysis when modal opens
    useEffect(() => {
        if (!isOpen) {
            setMode('keep'); // Reset on close
            return;
        }

        setAnalyzing(true);
        // Defer to prevent UI blocking
        setTimeout(() => {
            import('../../utils/packageDependencyAnalysis').then(({ analyzeGraph, getImpact, getAllDependencies }) => {
                const { reverseDeps } = analyzeGraph(packages);

                // 1. Safe Purge Impact
                const safeImpact = getImpact(packagesToDelete, packages, reverseDeps);

                // 2. Force Purge Impact ("Unsafe" / All Deps)
                const allDeps = getAllDependencies(packagesToDelete, packages);

                setImpactMap({
                    safe: safeImpact.cascade,
                    unsafe: allDeps
                });
                setAnalyzing(false);
            });
        }, 50);
    }, [isOpen, packagesToDelete, packages]);

    // Derived List based on Mode
    const filesToDelete = useMemo(() => {
        let extras: string[] = [];
        if (mode === 'purge_unused') extras = impactMap.safe;
        if (mode === 'purge_all') extras = impactMap.unsafe;

        // Combine unique
        return Array.from(new Set([...packagesToDelete, ...extras]));
    }, [mode, packagesToDelete, impactMap]);

    // Calculate Total Size
    const totalSize = useMemo(() => {
        let size = 0;
        const fileSet = new Set(filesToDelete);
        packages.forEach(p => {
            if (fileSet.has(p.filePath)) size += p.size;
        });
        return size;
    }, [filesToDelete, packages]);


    if (!isOpen) return null;

    const options = [
        {
            id: 'keep',
            label: 'Keep dependencies',
            tag: 'Default',
            desc: "Only deletes the package, it doesn't touch any dependencies."
        },
        {
            id: 'purge_unused',
            label: 'Purge unused dependencies',
            tag: 'Recommended',
            tagColor: 'green',
            desc: "Deletes the package and removes all dependencies that no other package depends on."
        },
        {
            id: 'purge_all',
            label: 'Purge all dependencies',
            tag: 'May break other packages',
            tagColor: 'red',
            desc: "Deletes all dependencies and the package itself, unconditionally."
        }
    ];

    const currentOption = options.find(o => o.id === mode) || options[0];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-200">
            <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-2xl flex flex-col shadow-2xl relative overflow-hidden">

                {/* Header */}
                <div className="p-5 border-b border-gray-800 flex items-start justify-between bg-gray-900/50">
                    <div className="flex gap-4">
                        <div className={clsx("p-3 rounded-xl flex items-center justify-center", mode === 'purge_all' ? "bg-red-500/20 text-red-500" : "bg-gray-800 text-gray-400")}>
                            {mode === 'purge_all' ? <ShieldAlert size={28} /> : <Trash2 size={28} />}
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-100">Delete Packages</h2>
                            <div className="text-sm text-gray-400 mt-1">
                                {packagesToDelete.length} package{packagesToDelete.length !== 1 ? 's' : ''} selected
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-500 hover:text-white rounded-lg hover:bg-gray-800 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 flex flex-col gap-6">

                    {/* Mode Selector (Dropdown) */}
                    <div className="relative z-20">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Deletion Mode</label>
                        <button
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                            className="w-full flex items-center justify-between p-4 bg-gray-800 border border-gray-700 rounded-lg hover:border-gray-600 transition-all text-left group"
                        >
                            <div>
                                <div className="font-bold text-gray-200 flex items-center gap-2">
                                    {currentOption.label}
                                    {currentOption.tag && (
                                        <span className={clsx(
                                            "text-[10px] px-2 py-0.5 rounded-full uppercase font-bold tracking-wide",
                                            currentOption.tagColor === 'green' ? "bg-emerald-500/20 text-emerald-400" :
                                                currentOption.tagColor === 'red' ? "bg-red-500/20 text-red-400" :
                                                    "bg-gray-700 text-gray-400"
                                        )}>
                                            {currentOption.tag}
                                        </span>
                                    )}
                                </div>
                                <div className="text-sm text-gray-400 mt-1 group-hover:text-gray-300">
                                    {currentOption.desc}
                                </div>
                            </div>
                            <ChevronDown className={clsx("text-gray-500 transition-transform", isMenuOpen && "rotate-180")} />
                        </button>

                        {/* Dropdown Menu */}
                        {isMenuOpen && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2">
                                {options.map(opt => (
                                    <button
                                        key={opt.id}
                                        onClick={() => { setMode(opt.id as DeleteMode); setIsMenuOpen(false); }}
                                        className="w-full text-left p-4 hover:bg-gray-750 border-b border-gray-700/50 last:border-0 flex items-start gap-3 transition-colors"
                                    >
                                        <div className={clsx("mt-1 w-4 h-4 rounded-full border flex items-center justify-center", mode === opt.id ? "border-violet-500 bg-violet-500" : "border-gray-600")}>
                                            {mode === opt.id && <Check size={10} className="text-white" />}
                                        </div>
                                        <div>
                                            <div className="font-bold text-gray-200 text-sm flex items-center gap-2">
                                                {opt.label}
                                                {opt.tag && opt.tagColor === 'red' && <span className="text-[9px] bg-red-900/50 text-red-300 px-1.5 rounded ml-1">UNSAFE</span>}
                                            </div>
                                            <div className="text-xs text-gray-400 mt-0.5 max-w-[90%]">{opt.desc}</div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Stats & List */}
                    <div className="bg-gray-950/30 rounded-xl border border-gray-800/50 flex flex-col h-48">
                        <div className="p-3 border-b border-gray-800 flex items-center justify-between text-xs text-gray-400 bg-gray-900/30">
                            <span>Packages to delete ({filesToDelete.length})</span>
                            <div className="flex items-center gap-2 text-gray-300">
                                <HardDrive size={14} className="text-violet-400" />
                                <span className="font-mono">{formatBytes(totalSize)}</span> Liberated
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-1">
                            {analyzing ? (
                                <div className="h-full flex items-center justify-center text-gray-500 gap-2 text-sm">
                                    <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
                                    Analyzing dependencies...
                                </div>
                            ) : (
                                filesToDelete.map(path => {
                                    const isTarget = packagesToDelete.includes(path);
                                    return (
                                        <div key={path} className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-gray-800/50 text-xs group">
                                            <span className={clsx("font-mono font-bold w-12 text-right shrink-0", isTarget ? "text-red-400" : "text-violet-400")}>
                                                {isTarget ? '[DEL]' : '[DEP]'}
                                            </span>
                                            <span className="text-gray-300 truncate" title={path}>{getBasename(path)}</span>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Warning for Force Purge */}
                    {mode === 'purge_all' && (
                        <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                            <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={16} />
                            <p className="text-xs text-red-200">
                                <b>Warning:</b> You are about to delete packages that may be used by other scenes or presets. This will likely break content in your library.
                            </p>
                        </div>
                    )}

                </div>

                {/* Footer */}
                <div className="p-5 border-t border-gray-800 bg-gray-900 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onConfirm(filesToDelete)}
                        disabled={analyzing}
                        className={clsx(
                            "px-6 py-2.5 rounded-lg text-sm font-bold shadow-lg transition-all flex items-center gap-2",
                            mode === 'purge_all'
                                ? "bg-red-600 hover:bg-red-500 text-white shadow-red-900/20"
                                : "bg-violet-600 hover:bg-violet-500 text-white shadow-violet-900/20"
                        )}
                    >
                        {mode === 'purge_all' ? 'Force Delete' : 'Delete'}
                    </button>
                </div>
            </div>
        </div>
    );
};
