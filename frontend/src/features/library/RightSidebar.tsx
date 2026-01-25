import { useState, useEffect } from 'react';
import { X, Check, AlertCircle, AlertTriangle, Box, FileImage, User, Scissors, Copy, Power, Unlink, CornerDownRight } from 'lucide-react';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import { VarPackage } from '../../types';
import { useThumbnail } from '../../hooks/useThumbnail';
import { PACKAGE_STATUS } from '../../constants';
import { usePackageContext } from '../../context/PackageContext';
import { getPackageStatus, findBestPackageMatch, getBlurStyle } from './utils';
import { resolveDependency, resolveRecursive } from '../../utils/dependency';
import { fetchWithAuth } from '../../services/api';

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
                                {(pkg.size / 1024 / 1024).toFixed(1)} MB
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
                            <div className="space-y-3">
                                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex justify-between items-center">
                                    Dependencies
                                    {pkg.meta.dependencies && <span className="text-gray-600">{Object.keys(pkg.meta.dependencies).length}</span>}
                                </h3>

                                <div className="space-y-1">
                                    {(() => {
                                        // Calculate flattened dependencies (Found Transitive + Missing Direct)
                                        const directDepsKeys = pkg.meta.dependencies ? Object.keys(pkg.meta.dependencies) : [];

                                        // Get Nodes with Depth
                                        const foundNodes = resolveRecursive([pkg], packages).filter(n => n.pkg.filePath !== pkg.filePath);

                                        // Find Missing Direct Dependencies (since recursive only returns found ones)
                                        const missingDirectIds = directDepsKeys.filter(key => {
                                            const res = resolveDependency(key, packages);
                                            return res.status === 'missing';
                                        });

                                        // Sort: Depth ascending (0, 1, 2) then Alphabetical
                                        // This groups Direct deps first, then Subs.
                                        const sortedNodes = [...foundNodes].sort((a, b) => {
                                            if (a.depth !== b.depth) return a.depth - b.depth;
                                            return a.pkg.fileName.localeCompare(b.pkg.fileName);
                                        });

                                        const totalCount = sortedNodes.length + missingDirectIds.length;

                                        if (totalCount === 0) {
                                            return <div className="text-xs text-gray-600 italic">No dependencies listed.</div>;
                                        }

                                        return (
                                            <>
                                                {/* Render Missing Direct First */}
                                                {missingDirectIds.map(depId => (
                                                    <div
                                                        key={depId}
                                                        className="flex items-center gap-3 p-2 rounded-lg text-xs border transition-colors cursor-pointer group bg-red-500/10 border-red-500/20 text-red-300 hover:bg-red-500/20"
                                                        title={`Missing Dependency: ${depId}`}
                                                    >
                                                        <X size={14} className="text-red-500 shrink-0" />
                                                        <span className="truncate flex-1 font-mono">{depId}</span>
                                                    </div>
                                                ))}

                                                {/* Render Found Recursive */}
                                                {sortedNodes.map(node => {
                                                    const resolvedPkg = node.pkg;
                                                    let status = getPackageStatus(resolvedPkg);
                                                    // Status Masking (False Red Fix)
                                                    // @ts-ignore
                                                    if (status === PACKAGE_STATUS.MISMATCH || status === PACKAGE_STATUS.ROOT) {
                                                        status = PACKAGE_STATUS.VALID;
                                                    }

                                                    const displayName = `${resolvedPkg.meta.creator}.${resolvedPkg.meta.packageName}.${resolvedPkg.meta.version}`;

                                                    let bgClass = "bg-gray-800 border-gray-700";
                                                    let icon = <Check size={14} className="text-green-500 shrink-0" />;

                                                    if (status === PACKAGE_STATUS.VALID) {
                                                        bgClass = "bg-green-500/10 border-green-500/20 text-green-300 hover:bg-green-500/20";
                                                    } else if (status === PACKAGE_STATUS.OBSOLETE) {
                                                        bgClass = "bg-yellow-500/10 border-yellow-500/20 text-yellow-300 hover:bg-yellow-500/20";
                                                        icon = <AlertCircle size={14} className="text-yellow-500 shrink-0" />;
                                                    } else if (status === PACKAGE_STATUS.DUPLICATE) {
                                                        bgClass = "bg-purple-500/10 border-purple-500/20 text-purple-300 hover:bg-purple-500/20";
                                                        icon = <Copy size={14} className="text-purple-500 shrink-0" />;
                                                    } else if (status === PACKAGE_STATUS.CORRUPT) {
                                                        bgClass = "bg-red-900/40 border-red-500 text-red-500 hover:bg-red-900/60";
                                                        icon = <AlertTriangle size={14} className="text-red-500 shrink-0" />;
                                                    } else if (status === PACKAGE_STATUS.DISABLED) {
                                                        bgClass = "bg-gray-800 border-gray-600 text-gray-400 hover:bg-gray-700";
                                                        icon = <Power size={14} className="text-gray-400 shrink-0" />;
                                                    } else if (status === PACKAGE_STATUS.SYSTEM) {
                                                        bgClass = "bg-gray-800/50 border-gray-700 text-gray-500 hover:bg-gray-800";
                                                        icon = <Box size={14} className="text-gray-500 shrink-0" />;
                                                    }

                                                    const indentLevel = Math.max(0, node.depth - 1);

                                                    return (
                                                        <div
                                                            key={resolvedPkg.filePath}
                                                            onClick={() => onDependencyClick(resolvedPkg.filePath)}
                                                            className={clsx(
                                                                "flex items-center gap-3 p-2 rounded-lg text-xs border transition-colors cursor-pointer group",
                                                                bgClass
                                                            )}
                                                            style={{ marginLeft: `${indentLevel * 16}px` }}
                                                            title={resolvedPkg.obsoletedBy ? resolvedPkg.obsoletedBy : displayName}
                                                        >
                                                            {indentLevel > 0 && (
                                                                <div className="text-gray-600 shrink-0">
                                                                    <CornerDownRight size={12} />
                                                                </div>
                                                            )}
                                                            {icon}
                                                            <span className="truncate flex-1 font-medium">{displayName}</span>
                                                        </div>
                                                    );
                                                })}
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>

                            {/* Used By (Incoming Dependencies) */}
                            <div className="mb-6">
                                <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2 flex items-center justify-between">
                                    Used By
                                    {pkg.referencedBy && <span className="text-gray-600">{pkg.referencedBy.length}</span>}
                                </div>
                                <div className="space-y-1">
                                    {pkg.referencedBy && pkg.referencedBy.length > 0 ? (
                                        pkg.referencedBy.map((refId) => {
                                            // SIMPLIFIED LOGIC: Find best enabled match. Show IT.
                                            const resolvedPkg = findBestPackageMatch(packages, refId);

                                            // Status Filtering (Mask Mismatch/Root -> Valid)
                                            // This explicitly prevents "Red" status for valid packages with internal warnings.
                                            let status = resolvedPkg ? getPackageStatus(resolvedPkg) : PACKAGE_STATUS.MISSING;
                                            if (status === PACKAGE_STATUS.MISMATCH || status === PACKAGE_STATUS.ROOT) {
                                                status = PACKAGE_STATUS.VALID;
                                            }

                                            // Navigation Target
                                            const targetId = resolvedPkg ? resolvedPkg.filePath : refId;
                                            const displayName = resolvedPkg?.meta
                                                ? `${resolvedPkg.meta.creator}.${resolvedPkg.meta.packageName}.${resolvedPkg.meta.version}`
                                                : (resolvedPkg?.fileName || refId);

                                            // Status Coloring
                                            let bgClass = "bg-red-500/10 border-red-500/20 text-red-300 hover:bg-red-500/20"; // Default Missing

                                            if (resolvedPkg) {
                                                if (status === PACKAGE_STATUS.VALID) {
                                                    bgClass = "bg-green-500/10 border-green-500/20 text-green-300 hover:bg-green-500/20";
                                                } else if (status === PACKAGE_STATUS.OBSOLETE) {
                                                    bgClass = "bg-yellow-500/10 border-yellow-500/20 text-yellow-300 hover:bg-yellow-500/20";
                                                } else if (status === PACKAGE_STATUS.DUPLICATE) {
                                                    bgClass = "bg-purple-500/10 border-purple-500/20 text-purple-300 hover:bg-purple-500/20";
                                                } else if (status === PACKAGE_STATUS.CORRUPT) {
                                                    bgClass = "bg-red-900/40 border-red-500 text-red-500 hover:bg-red-900/60";
                                                } else if (status === PACKAGE_STATUS.DISABLED) {
                                                    bgClass = "bg-gray-800 border-gray-600 text-gray-400 hover:bg-gray-700";
                                                    // @ts-ignore
                                                } else if (status === PACKAGE_STATUS.ROOT) {
                                                    bgClass = "bg-violet-500/10 border-violet-500/20 text-violet-300 hover:bg-violet-500/20";
                                                }
                                            }

                                            return (
                                                <div
                                                    key={refId}
                                                    onClick={() => onDependencyClick(targetId)}
                                                    className={clsx(
                                                        "flex items-center gap-3 p-2 rounded-lg text-xs border transition-colors cursor-pointer group",
                                                        bgClass
                                                    )}
                                                    title={resolvedPkg?.obsoletedBy ? resolvedPkg.obsoletedBy : displayName}
                                                >
                                                    {status === PACKAGE_STATUS.VALID ? <Check size={14} className="text-green-500 shrink-0" /> :
                                                        status === PACKAGE_STATUS.OBSOLETE ? <AlertCircle size={14} className="text-yellow-500 shrink-0" /> :
                                                            status === PACKAGE_STATUS.DUPLICATE ? <Copy size={14} className="text-purple-500 shrink-0" /> :
                                                                status === PACKAGE_STATUS.CORRUPT ? <AlertTriangle size={14} className="text-red-500 shrink-0" /> :
                                                                    status === PACKAGE_STATUS.DISABLED ? <Power size={14} className="text-gray-400 shrink-0" /> :
                                                                        // @ts-ignore
                                                                        status === PACKAGE_STATUS.ROOT ? <Unlink size={14} className="text-violet-500 shrink-0" /> :
                                                                            <X size={14} className="text-red-500 shrink-0" />
                                                    }
                                                    <span className="truncate flex-1">{displayName}</span>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <div className="text-xs text-gray-600 italic">No packages depend on this.</div>
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
        case 'Scene': return <FileImage size={24} />;
        case 'Look': return <User size={24} />;
        case 'Clothing': return <Scissors size={24} />;
        case 'Hair': return <Scissors size={24} />; // Reuse scissors for now or find better icon
        default: return <Box size={24} />;
    }
}

export default RightSidebar;
