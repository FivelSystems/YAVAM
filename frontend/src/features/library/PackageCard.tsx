import { useRef, useState, useEffect } from 'react';
import { VarPackage } from '../../types';
import clsx from 'clsx';
import { AlertCircle, Check, AlertTriangle, Power, Copy } from 'lucide-react';
import { motion } from 'framer-motion';

interface PackageCardProps {
    pkg: VarPackage;
    onContextMenu: (e: React.MouseEvent, pkg: VarPackage) => void;
    onSelect: (pkg: VarPackage, e?: React.MouseEvent) => void;
    isSelected?: boolean;
    viewMode?: 'grid' | 'list';
    censorThumbnails?: boolean;
}

const PackageCard = ({ pkg, onContextMenu, onSelect, isSelected, viewMode = 'grid', censorThumbnails = false }: PackageCardProps) => {
    const cardRef = useRef<HTMLDivElement>(null);
    const [thumbSrc, setThumbSrc] = useState<string | undefined>(
        pkg.thumbnailBase64 ? `data:image/jpeg;base64,${pkg.thumbnailBase64}` : undefined
    );
    const [isVisible, setIsVisible] = useState(false);

    const handleClick = (e: React.MouseEvent) => {
        onSelect(pkg, e);
    };

    // Ensure state syncs if pkg data updates (e.g. from backend scan completion)
    useEffect(() => {
        if (pkg.thumbnailBase64) {
            setThumbSrc(`data:image/jpeg;base64,${pkg.thumbnailBase64}`);
        } else if (!pkg.hasThumbnail) {
            setThumbSrc(undefined);
        }
    }, [pkg.thumbnailBase64, pkg.hasThumbnail]);

    // Lazy Loading Logic
    useEffect(() => {
        // @ts-ignore
        if (!window.go) {
            // Web Mode: Use API URL directly
            if (pkg.hasThumbnail && !pkg.thumbnailBase64) {
                setThumbSrc(`/api/thumbnail?filePath=${encodeURIComponent(pkg.filePath)}`);
            }
            return;
        }

        // Desktop Mode: Intersection Observer
        if (!pkg.hasThumbnail || thumbSrc) return; // Already have it or none exists

        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                setIsVisible(true);
                observer.disconnect(); // Only need trigger once
            }
        }, { rootMargin: '200px' });

        if (cardRef.current) observer.observe(cardRef.current);

        return () => observer.disconnect();
    }, [pkg.filePath, pkg.hasThumbnail, thumbSrc]);

    useEffect(() => {
        // Fetch for Desktop when visible
        // @ts-ignore
        if (window.go && isVisible && pkg.hasThumbnail && !thumbSrc) {
            // @ts-ignore
            window.go.main.App.GetPackageThumbnail(pkg.filePath)
                .then((b64: string) => {
                    if (b64) setThumbSrc(`data:image/jpeg;base64,${b64}`);
                })
                .catch((e: any) => console.error("Thumb load failed:", e));
        }
    }, [isVisible, pkg.hasThumbnail, pkg.filePath, thumbSrc]);


    // Visual State Logic
    let statusClass = "border-gray-700 opacity-60 grayscale";
    let statusIcon = <Power size={14} className="text-gray-400" />;

    if (isSelected) {
        statusClass = "border-blue-500 ring-2 ring-blue-500/50 shadow-xl z-10 grayscale-0 " + (viewMode === 'grid' ? "scale-[1.02]" : "");
    } else if (pkg.isEnabled) {
        statusClass = "border-gray-600 grayscale-0";
        if (pkg.missingDeps && pkg.missingDeps.length > 0) {
            statusClass = "border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]";
            statusIcon = <AlertCircle size={16} className="text-red-500" />;
        } else if (pkg.isExactDuplicate) {
            statusClass = "border-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.3)]";
            statusIcon = <Copy size={16} className="text-purple-500" />;
        } else if (pkg.isDuplicate) {
            statusClass = "border-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.3)]";
            statusIcon = <AlertTriangle size={16} className="text-yellow-500" />;
        } else {
            statusClass = "border-green-500/50 hover:border-green-400";
            statusIcon = <Check size={16} className="text-green-500" />;
        }
    }

    if (viewMode === 'list') {
        return (
            <div
                ref={cardRef}
                onClick={handleClick}
                onContextMenu={(e) => onContextMenu(e, pkg)}
                className={clsx(
                    "relative group rounded-lg border overflow-hidden cursor-pointer bg-gray-900 transition-colors hover:bg-gray-800 flex items-center h-20 p-2 gap-3",
                    statusClass
                )}
            >
                {/* Small Thumbnail */}
                <div className="h-16 w-16 bg-gray-800 rounded overflow-hidden shrink-0 relative">
                    {pkg.hasThumbnail && thumbSrc ? (
                        <img
                            src={thumbSrc}
                            alt={pkg.fileName}
                            loading="lazy"
                            className={clsx(
                                "w-full h-full object-cover",
                                censorThumbnails && "blur-[8px] scale-110" // Intensified Blur
                            )}
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-700 border border-gray-700">
                            <span className="text-[8px] font-bold">{pkg.hasThumbnail ? "..." : "NO IMG"}</span>
                        </div>
                    )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-1">
                        <h3 className="font-bold text-gray-200 text-sm truncate pr-2" title={pkg.fileName}>
                            {pkg.meta.packageName || pkg.fileName}
                        </h3>
                        {/* Status Icon */}
                        <div className="shrink-0">{statusIcon}</div>
                    </div>
                    <div className="flex justify-between items-center text-xs text-gray-500">
                        <span className="truncate">{pkg.meta.creator || "Unknown"}</span>
                        <div className="flex gap-2">
                            <span>v{pkg.meta.version}</span>
                            <span>{(pkg.size / 1024 / 1024).toFixed(1)} MB</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Default Grid View
    return (
        <motion.div
            layout
            ref={cardRef}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            onClick={handleClick}
            onContextMenu={(e) => onContextMenu(e, pkg)}
            className={clsx(
                "relative group rounded-xl border-2 overflow-hidden cursor-pointer bg-gray-900 aspect-square transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:z-10",
                statusClass
            )}
        >
            {/* Full size thumbnail */}
            <div className="absolute inset-0 w-full h-full">
                {pkg.hasThumbnail && thumbSrc ? (
                    <img
                        src={thumbSrc}
                        alt={pkg.fileName}
                        loading="lazy"
                        className={clsx(
                            "w-full h-full object-cover transition-transform duration-500 group-hover:scale-110",
                            censorThumbnails && "blur-[15px] scale-125" // Intense Blur
                        )}
                    />
                ) : (
                    <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
                        <span className="text-4xl font-bold text-gray-700 select-none opacity-50">{pkg.hasThumbnail ? "..." : "VAR"}</span>
                    </div>
                )}
            </div>

            {/* Gradient Overlay for Text Readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/40 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />

            {/* Content Overlay */}
            <div className="absolute inset-0 p-4 flex flex-col justify-end">
                <div className="flex justify-between items-end gap-2 mb-1">
                    <h3 className="font-bold text-white leading-tight line-clamp-2 drop-shadow-md text-sm sm:text-base">
                        {pkg.meta.packageName || pkg.fileName}
                    </h3>
                    {/* Status Icon Indicator */}
                    <div className="bg-gray-900/80 p-1.5 rounded-full backdrop-blur-sm border border-gray-700/50">
                        {statusIcon}
                    </div>
                </div>

                <div className="flex justify-between items-center text-xs text-gray-400 drop-shadow-sm">
                    <span className="truncate max-w-[70%]">{pkg.meta.creator || "Unknown"}</span>
                    <span>v{pkg.meta.version || "1"}</span>
                </div>

                {/* Hover Details / Hint */}
                <div className="h-0 group-hover:h-auto overflow-hidden transition-all duration-300">
                    <div className="text-[10px] text-gray-400 mt-2 border-t border-gray-700/50 pt-2 flex justify-between">
                        <span>{(pkg.size / 1024 / 1024).toFixed(1)} MB</span>
                        {pkg.isEnabled && pkg.missingDeps && pkg.missingDeps.length > 0 && <span className="text-red-400 font-bold">{pkg.missingDeps.length} Missing</span>}
                        {pkg.isEnabled && pkg.isExactDuplicate && <span className="text-purple-400 font-bold">Duplicate</span>}
                        {pkg.isEnabled && !pkg.isExactDuplicate && pkg.isDuplicate && <span className="text-yellow-400 font-bold">Obsolete</span>}
                        {!pkg.isEnabled && <span>Disabled</span>}
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

export default PackageCard;
