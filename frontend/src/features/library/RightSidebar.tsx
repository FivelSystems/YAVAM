import { useState, useEffect, useMemo } from 'react';
import { X, Box, FileImage, User, Scissors, Copy, AlertCircle, Puzzle, Music, Image as ImageIcon } from 'lucide-react';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import { VarPackage } from '../../types';
import { useThumbnail } from '../../hooks/useThumbnail';

import { findBestPackageMatch, getBlurStyle } from './utils';
import { getDependencySummary } from '../../utils/dependency';
import { usePackageContext } from '../../context/PackageContext';
import { fetchWithAuth } from '../../services/api';
import { formatBytes } from '../../utils/format';
import { DependencyGroup } from './components/DependencyGroup';

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
    onFilterByCreator: (creator: string | null) => void;
    onDependencyClick: (depId: string) => void;
    onTitleClick: (pkg: VarPackage) => void;
    getDependencyStatus: (depId: string) => 'valid' | 'mismatch' | 'missing' | 'scanning' | 'system' | 'corrupt' | 'disabled';
    selectedCreator?: string | null;
    censorThumbnails?: boolean;
    blurAmount?: number;
    isOffScreen?: boolean;
}

const RightSidebar = ({ pkg, onClose, activeTab, onResolve, onTabChange, onFilterByCreator, onDependencyClick, onTitleClick, selectedCreator, censorThumbnails = false, blurAmount = 10, isOffScreen = false }: RightSidebarProps) => {

    const [contents, setContents] = useState<PackageContent[]>([]);
    const [loading, setLoading] = useState(false);
    const thumbSrc = useThumbnail(pkg);
    const { packages } = usePackageContext();

    useEffect(() => {
        let isActive = true;

        const fetchContents = async () => {
            if (!pkg) {
                if (isActive) setContents([]);
                return;
            }
            if (isActive) setLoading(true);
            try {
                // @ts-ignore
                if (window.go) {
                    // @ts-ignore
                    const res = await window.go.main.App.GetPackageContents(pkg.filePath);
                    if (isActive) setContents(res || []);
                } else {
                    // Web Mode Logic
                    const res = await fetchWithAuth('/api/contents', {
                        method: 'POST',
                        body: JSON.stringify({ filePath: pkg.filePath })
                    });
                    if (!res.ok) throw new Error("Failed to fetch contents");
                    const data = await res.json();
                    if (isActive) setContents(data || []);
                }
            } catch (e) {
                console.error(e);
                if (isActive) setContents([]);
            } finally {
                if (isActive) setLoading(false);
            }
        };

        fetchContents();

        return () => {
            isActive = false;
        };
    }, [pkg]);

    if (!pkg) return null;

    const depsInfo = useMemo(() => {
        if (!pkg) return { nodes: [], missing: [], totalSize: 0 };
        return getDependencySummary(pkg, packages);
    }, [pkg, packages]);

    const depsItems = useMemo(() => {
        return [
            ...depsInfo.missing.map(depId => ({
                missingId: depId,
                targetId: depId,
                depth: 0
            })),
            ...depsInfo.nodes.map(node => ({
                pkg: node.pkg,
                targetId: node.pkg.filePath,
                depth: Math.max(0, node.depth - 1)
            }))
        ];
    }, [depsInfo]);

    const usedByItems = useMemo(() => {
        if (!pkg || !pkg.referencedBy) return [];
        return pkg.referencedBy.map(refId => {
            const resolvedPkg = findBestPackageMatch(packages, refId);
            return {
                pkg: resolvedPkg || undefined,
                missingId: !resolvedPkg ? refId : undefined,
                targetId: resolvedPkg ? resolvedPkg.filePath : refId,
                depth: 0
            };
        });
    }, [pkg, packages]);

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
                <div
                    className="flex-1 mr-2 cursor-pointer group"
                    onClick={() => onTitleClick(pkg)}
                    title={isOffScreen ? "Package is on another page - Click to Locate" : "Locate in grid"}
                >
                    <motion.h2
                        className={clsx(
                            "text-lg font-bold truncate transition-colors",
                            isOffScreen ? "text-blue-300" : "text-white group-hover:text-blue-400"
                        )}
                        animate={isOffScreen ? {
                            textShadow: ["0 0 0px rgba(96, 165, 250, 0)", "0 0 15px rgba(96, 165, 250, 0.8)", "0 0 0px rgba(96, 165, 250, 0)"],
                        } : { textShadow: "none" }}
                        transition={isOffScreen ? { duration: 1.5, repeat: Infinity, repeatType: "reverse" } : {}}
                    >
                        {pkg.meta.packageName || pkg.fileName}
                    </motion.h2>
                </div>
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
                            className={clsx(
                                "w-full h-full object-cover object-center transition-transform duration-700 group-hover:scale-105",
                                censorThumbnails && "scale-110" // Scale up to hide blur edges
                            )}
                            style={getBlurStyle(censorThumbnails, blurAmount)}
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
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (selectedCreator === pkg.meta.creator) {
                                            onFilterByCreator(null);
                                        } else {
                                            onFilterByCreator(pkg.meta.creator);
                                        }
                                    }}
                                    className={clsx(
                                        "px-2 py-0.5 rounded-full text-xs font-medium border transition-colors cursor-pointer",
                                        selectedCreator === pkg.meta.creator
                                            ? "bg-blue-500 text-white border-blue-400 hover:bg-blue-600"
                                            : "bg-blue-500/20 text-blue-300 border-blue-500/30 hover:bg-blue-500/50 hover:text-white"
                                    )}
                                    title={selectedCreator === pkg.meta.creator ? "Clear filter" : `Filter by ${pkg.meta.creator}`}
                                >
                                    {pkg.meta.creator}
                                </button>
                            )}
                            <span className="px-2 py-0.5 rounded-full bg-gray-700 text-gray-300 text-xs font-medium border border-gray-600">
                                v{pkg.meta.version}
                            </span>
                            <span className="text-xs text-gray-400 ml-auto">
                                {formatBytes(pkg.size)}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Conflict/Duplicate Resolver - Prominent if Issue Exists */}
                {(pkg.isDuplicate || pkg.isExactDuplicate) && (
                    <div className={clsx(
                        "p-4 border-b",
                        pkg.isExactDuplicate
                            ? "bg-purple-500/10 border-purple-500/20"
                            : "bg-yellow-500/10 border-yellow-500/20"
                    )}>
                        <div className="flex items-start gap-3">
                            {pkg.isExactDuplicate
                                ? <Copy size={18} className="text-purple-500 mt-0.5 shrink-0" />
                                : <AlertCircle size={18} className="text-yellow-500 mt-0.5 shrink-0" />
                            }
                            <div className="flex-1">
                                <h4 className={clsx(
                                    "text-sm font-semibold mb-1",
                                    pkg.isExactDuplicate ? "text-purple-400" : "text-yellow-400"
                                )}>
                                    {pkg.isExactDuplicate ? "Duplicate Detected" : "Obsolete Version"}
                                </h4>
                                <p className="text-xs text-gray-400 mb-2">
                                    {pkg.obsoletedBy || (pkg.isExactDuplicate
                                        ? "The same package has been found somewhere else across the library."
                                        : "A newer version of this package is available.")}
                                </p>
                                <button
                                    onClick={() => onResolve(pkg)}
                                    className={clsx(
                                        "w-full py-1.5 rounded text-xs font-medium transition-colors shadow-sm text-white",
                                        pkg.isExactDuplicate
                                            ? "bg-purple-600 hover:bg-purple-500"
                                            : "bg-yellow-600 hover:bg-yellow-500"
                                    )}
                                >
                                    Fix
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
                            <div className="mb-6">
                                <DependencyGroup
                                    title="Dependencies"
                                    items={depsItems}
                                    emptyMessage="No dependencies listed."
                                    onItemClick={onDependencyClick}
                                />
                            </div>

                            {/* Used By (Incoming Dependencies) */}
                            <div className="mb-6">
                                <DependencyGroup
                                    title="Used By"
                                    items={usedByItems}
                                    emptyMessage="No packages depend on this."
                                    onItemClick={onDependencyClick}
                                />
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
                                                        className={clsx(
                                                            "w-full h-full object-cover transition-transform duration-500 group-hover:scale-110",
                                                            censorThumbnails && "scale-125" // Scale up more to hide blur edges
                                                        )}
                                                        style={getBlurStyle(censorThumbnails, blurAmount)}
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
        case 'Scene':  return <FileImage size={24} />;
        case 'Look':   return <User size={24} />;
        case 'Pose':   return <User size={24} />;
        case 'Clothing': return <Scissors size={24} />;
        case 'Hair':   return <Scissors size={24} />;
        case 'Plugin': return <Puzzle size={24} />;
        case 'Sound':  return <Music size={24} />;
        case 'Image':  return <ImageIcon size={24} />;
        default:       return <Box size={24} />;
    }
}

export default RightSidebar;
