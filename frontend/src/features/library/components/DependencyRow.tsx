import { Check, AlertCircle, AlertTriangle, Box, Power, Unlink, X, Copy, CornerDownRight, FolderInput } from 'lucide-react';
import clsx from 'clsx';
import { VarPackage } from '../../../types';
import { getPackageStatus } from '../utils';
import { PACKAGE_STATUS } from '../../../constants';
import { formatBytes } from '../../../utils/format';

interface DependencyRowProps {
    pkg?: VarPackage; // if found in the current library
    missingId?: string; // if not found locally
    external?: { libraryLabel: string; isEnabled: boolean }; // set when it lives in another library
    indentLevel?: number;
    onClick: () => void;
    onContextMenu?: (pkg: VarPackage, e: React.MouseEvent) => void;
}

// A small blue badge naming the library an external dependency lives in.
const LibraryBadge = ({ label }: { label: string }) => (
    <span className="shrink-0 px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[10px] font-medium max-w-[45%] truncate flex items-center gap-1">
        <FolderInput size={10} /> {label}
    </span>
);

export const DependencyRow = ({ pkg, missingId, external, indentLevel = 0, onClick, onContextMenu }: DependencyRowProps) => {
    // Not in the current library.
    if (!pkg) {
        // In another library: colour by its enable state (like a normal row); only
        // the library label is blue. Clickable — jumps to that library and locates.
        if (external) {
            const bgClass = external.isEnabled
                ? "bg-green-500/10 border-green-500/20 text-green-300 hover:bg-green-500/20"
                : "bg-gray-800 border-gray-600 text-gray-400 hover:bg-gray-700";
            const icon = external.isEnabled
                ? <Check size={14} className="text-green-500 shrink-0" />
                : <Power size={14} className="text-gray-400 shrink-0" />;
            return (
                <div
                    onClick={onClick}
                    className={clsx("flex items-center gap-3 p-2 rounded-lg text-xs border transition-colors cursor-pointer group", bgClass)}
                    title={`In library “${external.libraryLabel}” — click to switch and locate: ${missingId}`}
                >
                    {indentLevel > 0 && (
                        <div className="text-gray-600 shrink-0">
                            <CornerDownRight size={12} />
                        </div>
                    )}
                    {icon}
                    <span className="truncate flex-1 min-w-0 font-mono">{missingId}</span>
                    <LibraryBadge label={external.libraryLabel} />
                </div>
            );
        }

        // Genuinely missing from every library.
        return (
            <div
                onClick={onClick}
                className="flex items-center gap-3 p-2 rounded-lg text-xs border transition-colors cursor-pointer group bg-red-500/10 border-red-500/20 text-red-300 hover:bg-red-500/20"
                title={`Missing Dependency: ${missingId}`}
            >
                {indentLevel > 0 && (
                    <div className="text-gray-600 shrink-0">
                        <CornerDownRight size={12} />
                    </div>
                )}
                <X size={14} className="text-red-500 shrink-0" />
                <span className="truncate flex-1 min-w-0 font-mono">{missingId}</span>
            </div>
        );
    }

    // Found Package State
    let status = getPackageStatus(pkg);
    // Mask Mismatch/Root -> Valid (False Red Fix)
    // @ts-ignore
    if (status === PACKAGE_STATUS.MISMATCH || status === PACKAGE_STATUS.ROOT) {
        status = PACKAGE_STATUS.VALID;
    }

    const displayName = pkg.meta
        ? `${pkg.meta.creator}.${pkg.meta.packageName}.${pkg.meta.version}`
        : pkg.fileName;

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
    // @ts-ignore
    } else if (status === PACKAGE_STATUS.SYSTEM) {
        bgClass = "bg-gray-800/50 border-gray-700 text-gray-500 hover:bg-gray-800";
        icon = <Box size={14} className="text-gray-500 shrink-0" />;
    // @ts-ignore
    } else if (status === PACKAGE_STATUS.ROOT) {
        bgClass = "bg-violet-500/10 border-violet-500/20 text-violet-300 hover:bg-violet-500/20";
        icon = <Unlink size={14} className="text-violet-500 shrink-0" />;
    }

    return (
        <div
            onClick={onClick}
            onContextMenu={onContextMenu && pkg ? (e) => { e.preventDefault(); onContextMenu(pkg, e); } : undefined}
            className={clsx(
                "flex items-center gap-3 p-2 rounded-lg text-xs border transition-colors cursor-pointer group",
                bgClass
            )}
            style={{ marginLeft: `${indentLevel * 16}px` }}
            title={pkg.obsoletedBy ? pkg.obsoletedBy : displayName}
        >
            {indentLevel > 0 && (
                <div className="text-gray-600 shrink-0">
                    <CornerDownRight size={12} />
                </div>
            )}
            {icon}
            <span className="truncate flex-1 min-w-0 font-medium">{displayName}</span>
            <span className="text-[10px] text-gray-400/80 shrink-0 group-hover:text-gray-300 transition-colors text-right">
                {formatBytes(pkg.size)}
            </span>
        </div>
    );
};
