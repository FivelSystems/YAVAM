import { Power, FolderOpen, Copy, Trash2, FileCode, Scissors, Download, Layers, Sparkles, LucideIcon } from 'lucide-react';
import { VarPackage } from '../types';
import { getStoredToken } from '../services/auth';

export interface PackageActionItem {
    key: string;
    icon: LucideIcon;
    label: string;
    tone?: 'default' | 'danger';
    onClick: () => void;
    /** Present (not omitted) rather than filtered out of the list, so callers
     * can assert on the full conditional set directly. Render-side, filter
     * with `.filter(item => !item.hidden)` before mapping. */
    hidden?: boolean;
}

interface UsePackageActionItemsParams {
    pkg: VarPackage | null;
    selectedCount: number;
    isWeb: boolean;
    /** Web + authenticated (not a guest session) — guests must not get raw file downloads. */
    canDownloadFile: boolean;
    onToggle: (pkg: VarPackage) => void;
    onOpenFolder: (pkg: VarPackage) => void;
    onDownload: (pkg: VarPackage) => void;
    onCopyPath: (pkg: VarPackage) => void;
    onCopyFiles: (pkgs: VarPackage[]) => void;
    onCutFile: (pkg: VarPackage) => void;
    onDelete: (pkg: VarPackage) => void;
    onMerge: (pkg: VarPackage) => void;
    onMergeInPlace: (pkg: VarPackage) => void;
    onResolve: (pkg: VarPackage) => void;
}

/** Per-item icon tint, shared so the desktop popover and the mobile sheet render
 * the same package consistently. Danger items (delete) are deliberately excluded —
 * their icon inherits the row's red text colour instead. */
export const actionIconClassName = (key: string, pkg: VarPackage | null): string => {
    switch (key) {
        case 'toggle': return pkg?.isEnabled ? 'text-red-400' : 'text-green-400';
        case 'merge-root':
        case 'merge-in-place': return 'text-purple-400';
        case 'resolve': return 'text-yellow-400';
        case 'open-folder': return 'text-blue-400';
        case 'install': return 'text-blue-400';
        case 'download-file': return 'text-green-400';
        default: return 'text-gray-400';
    }
};

/**
 * Single source of truth for "what can you do to a package" — the conditional
 * action list both `ContextMenu` (desktop right-click popover) and
 * `ActionSheet` (mobile long-press/overflow) render, as two presentations of
 * the same data. Mirrors the conditionals `ContextMenu.tsx` already had:
 * merge actions only on an exact duplicate, resolve only on a (non-exact)
 * duplicate, folder/copy-file/cut-file hidden on web, a direct-download row
 * shown only on web *and* authenticated (desktop uses the install flow
 * instead; guest/unauthenticated web sessions must not get raw file downloads).
 */
export const usePackageActionItems = ({
    pkg, selectedCount, isWeb, canDownloadFile,
    onToggle, onOpenFolder, onDownload, onCopyPath, onCopyFiles, onCutFile, onDelete, onMerge, onMergeInPlace, onResolve,
}: UsePackageActionItemsParams): PackageActionItem[] => {
    if (!pkg) return [];

    const downloadFileDirect = () => {
        const token = getStoredToken();
        const url = `/files/?path=${encodeURIComponent(pkg.filePath)}&token=${token || ''}`;
        const a = document.createElement('a');
        a.href = url;
        a.download = pkg.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    return [
        {
            key: 'toggle',
            icon: Power,
            label: selectedCount > 1 ? 'Toggle Selected' : (pkg.isEnabled ? 'Disable' : 'Enable'),
            onClick: () => onToggle(pkg),
        },
        {
            key: 'merge-root',
            icon: Layers,
            label: 'Merge to Root',
            hidden: !pkg.isExactDuplicate,
            onClick: () => onMerge(pkg),
        },
        {
            key: 'merge-in-place',
            icon: Layers,
            label: 'Merge in Place',
            hidden: !pkg.isExactDuplicate,
            onClick: () => onMergeInPlace(pkg),
        },
        {
            key: 'resolve',
            icon: Sparkles,
            label: 'Fix Obsolete',
            hidden: pkg.isExactDuplicate || !pkg.isDuplicate,
            onClick: () => onResolve(pkg),
        },
        {
            key: 'open-folder',
            icon: FolderOpen,
            label: 'Open Folder',
            hidden: isWeb,
            onClick: () => onOpenFolder(pkg),
        },
        {
            key: 'copy-path',
            icon: FileCode,
            label: 'Copy Path',
            onClick: () => onCopyPath(pkg),
        },
        {
            key: 'copy-file',
            icon: Copy,
            label: selectedCount > 1 ? 'Copy Selected Files' : 'Copy File',
            hidden: isWeb,
            onClick: () => onCopyFiles([pkg]),
        },
        {
            key: 'cut-file',
            icon: Scissors,
            label: 'Cut File',
            hidden: isWeb,
            onClick: () => onCutFile(pkg),
        },
        {
            key: 'install',
            icon: Download,
            label: 'Install to Library',
            onClick: () => onDownload(pkg),
        },
        {
            key: 'download-file',
            icon: Download,
            label: 'Download File',
            hidden: !canDownloadFile,
            onClick: downloadFileDirect,
        },
        {
            key: 'delete',
            icon: Trash2,
            label: `Delete${selectedCount > 1 ? ` (${selectedCount})` : ''}`,
            tone: 'danger',
            onClick: () => onDelete(pkg),
        },
    ];
};

export default usePackageActionItems;
