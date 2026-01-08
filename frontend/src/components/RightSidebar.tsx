import { useState, useEffect } from 'react';
import { X, Check, AlertCircle, Box, FileImage, User, Scissors } from 'lucide-react';
import clsx from 'clsx';
import { motion } from 'framer-motion';

// Ideally, App exports it. 
// If App.tsx exports it, we need to import it.
// The previous code had "import { VarPackage } from '../App';" but linter complained.
// Maybe circle dependency issue if App imports RightSidebar and RightSidebar imports App?
// YES. Circular dependency.
// Best practice: Move types to a separate file `src/types.ts`.
// For now, I will use "any" or a simplified local interface to break the cycle quickly, 
// OR simpler: just ignore the exported one and keep local one but rename it or don't import.
// I will keep local but NOT import from App.

interface VarPackage {
    filePath: string;
    fileName: string;
    size: number;
    meta: {
        creator: string;
        packageName: string;
        version: string;
        description?: string;
        dependencies?: Record<string, any>;
    };
    thumbnailPath: string;
    thumbnailBase64?: string;
    isEnabled: boolean;
    hasThumbnail: boolean;
    missingDeps: string[];
    isDuplicate: boolean;
    type?: string;
    tags?: string[];
}

export interface PackageContent {
    filePath: string;
    fileName: string;
    type: string;
    thumbnailBase64?: string;
    size: number;
}

interface RightSidebarProps {
    pkg: VarPackage | null;
    onClose: () => void;
    onResolve: (pkg: VarPackage) => void;
    activeTab: 'details' | 'contents';
    onTabChange: (tab: 'details' | 'contents') => void;
}

const RightSidebar = ({ pkg, onClose, onResolve, activeTab, onTabChange }: RightSidebarProps) => {
    // ... (state hooks same as before) ...
    const [contents, setContents] = useState<PackageContent[]>([]);
    const [loading, setLoading] = useState(false);
    const [thumbSrc, setThumbSrc] = useState<string | undefined>(undefined);

    useEffect(() => {
        if (pkg) {
            fetchContents();

            // Thumbnail Logic
            if (pkg.thumbnailBase64) {
                setThumbSrc(`data:image/jpeg;base64,${pkg.thumbnailBase64}`);
            } else if (pkg.hasThumbnail) {
                // Fetch
                // @ts-ignore
                if (window.go) {
                    // @ts-ignore
                    window.go.main.App.GetPackageThumbnail(pkg.filePath)
                        .then((b64: string) => {
                            if (b64) setThumbSrc(`data:image/jpeg;base64,${b64}`);
                        })
                        .catch((e: any) => console.error(e));
                } else {
                    setThumbSrc(`/api/thumbnail?filePath=${encodeURIComponent(pkg.filePath)}`);
                }
            } else {
                setThumbSrc(undefined);
            }

        } else {
            setContents([]);
            setThumbSrc(undefined);
        }
    }, [pkg]);

    const fetchContents = async () => {
        if (!pkg) return;
        setLoading(true);
        try {
            // @ts-ignore
            if (window.go) {
                // @ts-ignore
                const res = await window.go.main.App.GetPackageContents(pkg.filePath);
                setContents(res || []);
            } else {
                // Web Mode Logic
                const res = await fetch('/api/contents', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filePath: pkg.filePath })
                });
                if (!res.ok) throw new Error("Failed to fetch contents");
                const data = await res.json();
                setContents(data || []);
            }
        } catch (e) {
            console.error(e);
            setContents([]);
        } finally {
            setLoading(false);
        }
    };

    if (!pkg) return null;

    return (
        <motion.div
            initial={{ x: 400, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed inset-0 w-full md:w-[35%] md:min-w-[320px] md:max-w-[600px] md:relative md:inset-auto z-50 md:z-20 bg-gray-900 border-l border-gray-800 flex flex-col h-full shadow-2xl shrink-0"
        >
            {/* Header */}
            <div className="p-4 border-b border-gray-800 flex justify-between items-start bg-gray-900/50 backdrop-blur-sm sticky top-0 z-10">
                <h2 className="text-lg font-bold text-white truncate flex-1 mr-2" title={pkg.fileName}>
                    {pkg.meta.packageName || pkg.fileName}
                </h2>
                <button
                    onClick={onClose}
                    className="p-1 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
                >
                    <X size={20} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {/* Thumbnail - Reduced Height */}
                <div className="h-48 w-full bg-gray-950 relative overflow-hidden group shrink-0">
                    {pkg.hasThumbnail && thumbSrc ? (
                        <img
                            src={thumbSrc}
                            alt={pkg.fileName}
                            className="w-full h-full object-cover object-center transition-transform duration-700 group-hover:scale-105"
                        />
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-gray-700">
                            <Box size={32} className="mb-2 opacity-50" />
                            <span className="text-xs">No Preview</span>
                        </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-transparent to-transparent opacity-80" />

                    <div className="absolute bottom-0 left-0 right-0 p-4">
                        <div className="flex items-center gap-2 mb-1">
                            {pkg.meta.creator && (
                                <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-xs font-medium border border-blue-500/30">
                                    {pkg.meta.creator}
                                </span>
                            )}
                            <span className="px-2 py-0.5 rounded-full bg-gray-700 text-gray-300 text-xs font-medium border border-gray-600">
                                v{pkg.meta.version}
                            </span>
                            <span className="text-xs text-gray-400 ml-auto">
                                {(pkg.size / 1024 / 1024).toFixed(1)} MB
                            </span>
                        </div>
                    </div>
                </div>

                {/* Conflict/Duplicate Resolver - Prominent if Issue Exists */}
                {pkg.isDuplicate && (
                    <div className="p-4 bg-yellow-500/10 border-b border-yellow-500/20">
                        <div className="flex items-start gap-3">
                            <AlertCircle size={18} className="text-yellow-500 mt-0.5 shrink-0" />
                            <div className="flex-1">
                                <h4 className="text-sm font-semibold text-yellow-400 mb-1">Duplicate Detected</h4>
                                <p className="text-xs text-gray-400 mb-2">This package has conflicting versions.</p>
                                <button
                                    onClick={() => onResolve(pkg)}
                                    className="w-full py-1.5 bg-yellow-600 hover:bg-yellow-500 text-white rounded text-xs font-medium transition-colors shadow-sm"
                                >
                                    Resolve Conflicts
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Tabs / Switcher */}
                <div className="flex border-b border-gray-800 sticky top-0 bg-gray-900 z-10 text-sm font-medium">
                    <button
                        onClick={() => onTabChange('details')}
                        className={clsx(
                            "flex-1 py-3 text-center transition-colors border-b-2",
                            activeTab === 'details'
                                ? "border-blue-500 text-blue-400 bg-blue-500/5"
                                : "border-transparent text-gray-400 hover:text-white hover:bg-gray-800"
                        )}
                    >
                        Details
                    </button>
                    <button
                        onClick={() => onTabChange('contents')}
                        className={clsx(
                            "flex-1 py-3 text-center transition-colors border-b-2",
                            activeTab === 'contents'
                                ? "border-blue-500 text-blue-400 bg-blue-500/5"
                                : "border-transparent text-gray-400 hover:text-white hover:bg-gray-800"
                        )}
                    >
                        Contents <span className="ml-1 text-xs opacity-60">({contents.length})</span>
                    </button>
                </div>

                <div className="p-4 space-y-6">
                    {/* DETAILS TAB */}
                    {activeTab === 'details' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">

                            {/* Description */}
                            {pkg.meta.description && (
                                <div className="space-y-2">
                                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</h3>
                                    <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                                        {pkg.meta.description}
                                    </p>
                                </div>
                            )}

                            {/* Dependencies */}
                            <div className="space-y-3">
                                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex justify-between items-center">
                                    Dependencies
                                    {pkg.meta.dependencies && <span className="text-gray-600">{Object.keys(pkg.meta.dependencies).length}</span>}
                                </h3>

                                <div className="space-y-1">
                                    {pkg.meta.dependencies && Object.keys(pkg.meta.dependencies).length > 0 ? (
                                        Object.entries(pkg.meta.dependencies).map(([depId]) => {
                                            const isMissing = pkg.missingDeps?.includes(depId);
                                            return (
                                                <div key={depId} className={clsx(
                                                    "flex items-center gap-3 p-2 rounded-lg text-xs border transition-colors",
                                                    isMissing
                                                        ? "bg-red-500/10 border-red-500/20 text-red-300"
                                                        : "bg-gray-800 border-gray-700 text-gray-400"
                                                )}>
                                                    {isMissing ? (
                                                        <AlertCircle size={14} className="text-red-400 shrink-0" />
                                                    ) : (
                                                        <Check size={14} className="text-green-500 shrink-0" />
                                                    )}
                                                    <span className="truncate flex-1" title={depId}>{depId}</span>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <div className="text-xs text-gray-600 italic">No dependencies listed.</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}


                    {/* CONTENTS TAB */}
                    {activeTab === 'contents' && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                            {loading ? (
                                <div className="flex justify-center p-8">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                                </div>
                            ) : contents.length === 0 ? (
                                <div className="text-center py-8 text-gray-500 text-sm">
                                    No previewable content found.
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-3">
                                    {contents.map((item, idx) => (
                                        <div key={idx} className="group bg-gray-800 rounded-lg overflow-hidden border border-gray-700 hover:border-gray-500 transition-colors">
                                            <div className="aspect-[4/5] bg-gray-900 relative overflow-hidden">
                                                {item.thumbnailBase64 ? (
                                                    <img
                                                        src={`data:image/jpeg;base64,${item.thumbnailBase64}`}
                                                        alt={item.fileName}
                                                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-700 p-2 text-center">
                                                        {getContentIcon(item.type)}
                                                        <span className="text-[10px] mt-1 opacity-50">{item.type}</span>
                                                    </div>
                                                )}
                                                {/* Type Badge */}
                                                <div className="absolute top-1 right-1">
                                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-black/60 text-white backdrop-blur-sm uppercase">
                                                        {item.type}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="p-2">
                                                <div className="text-xs font-medium text-gray-300 truncate" title={item.fileName}>
                                                    {item.fileName}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                </div>
            </div>

            {/* Footer Status */}
            <div className="p-3 border-t border-gray-800 bg-gray-900 text-xs text-gray-500 font-mono text-center truncate">
                {pkg.filePath}
            </div>
        </motion.div>
    );
};

const getContentIcon = (type: string) => {
    switch (type) {
        case 'Scene': return <FileImage size={24} />;
        case 'Look': return <User size={24} />;
        case 'Clothing': return <Scissors size={24} />;
        case 'Hair': return <Scissors size={24} />; // Reuse scissors for now or find better icon
        default: return <Box size={24} />;
    }
}

export default RightSidebar;
