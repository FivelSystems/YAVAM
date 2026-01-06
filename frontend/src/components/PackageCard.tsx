import { VarPackage } from '../App';
import clsx from 'clsx';
import { AlertCircle, Check, AlertTriangle, Power } from 'lucide-react';
import { motion } from 'framer-motion';

interface PackageCardProps {
    pkg: VarPackage;
    onResolve: (pkg: VarPackage) => void;
    onShowMissing: (pkg: VarPackage) => void;
    onContextMenu: (e: React.MouseEvent, pkg: VarPackage) => void;
}

const PackageCard = ({ pkg, onResolve, onShowMissing, onContextMenu }: PackageCardProps) => {

    const handleClick = () => {
        if (pkg.isEnabled) {
            if (pkg.missingDeps && pkg.missingDeps.length > 0) {
                onShowMissing(pkg);
                return;
            }
            if (pkg.isDuplicate) {
                onResolve(pkg);
                return;
            }
        }
    };

    // Visual State Logic
    let statusClass = "border-gray-700 opacity-60 grayscale"; // Disabled state default
    let statusIcon = <Power size={14} className="text-gray-400" />;

    if (pkg.isEnabled) {
        statusClass = "border-gray-600 grayscale-0"; // Active default
        if (pkg.missingDeps && pkg.missingDeps.length > 0) {
            statusClass = "border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]";
            statusIcon = <AlertCircle size={16} className="text-red-500" />;
        } else if (pkg.isDuplicate) {
            statusClass = "border-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.3)]";
            statusIcon = <AlertTriangle size={16} className="text-yellow-500" />;
        } else {
            statusClass = "border-green-500/50 hover:border-green-400";
            statusIcon = <Check size={16} className="text-green-500" />;
        }
    }

    return (
        <motion.div
            layout
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
                {pkg.hasThumbnail ? (
                    <img
                        src={`data:image/jpeg;base64,${pkg.thumbnailBase64}`}
                        alt={pkg.fileName}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                ) : (
                    <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
                        <span className="text-4xl font-bold text-gray-700 select-none opacity-50">VAR</span>
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
                        {pkg.isEnabled && pkg.missingDeps && <span className="text-red-400 font-bold">{pkg.missingDeps.length} Missing</span>}
                        {pkg.isEnabled && pkg.isDuplicate && <span className="text-yellow-400 font-bold">Conflict</span>}
                        {!pkg.isEnabled && <span>Disabled</span>}
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

export default PackageCard;
