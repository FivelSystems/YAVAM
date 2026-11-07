import { CheckCircle2, Download, Power, Sparkles, Trash2 } from 'lucide-react';
import { VarPackage } from '../../types';
import { STATUS_FILTERS } from '../../constants';
import { useActionContext } from '../../context/ActionContext';
import { AnchoredMenu, MenuDivider, MenuItem } from '../../components/ui/AnchoredMenu';

export type SidebarGroupType = 'creator' | 'type' | 'status';

/** A package is standalone when it declares no dependencies of its own. */
export const isStandalone = (pkg: VarPackage): boolean => !pkg.meta?.dependencies || Object.keys(pkg.meta.dependencies).length === 0;

/** Whether a package belongs to the right-clicked creator/type/status facet. */
export const isPackageInContext = (pkg: VarPackage, groupType: SidebarGroupType, key: string): boolean => {
    if (groupType === 'creator') return (pkg.meta.creator || 'Unknown') === key;
    if (groupType === 'type') return (pkg.type || 'Unknown') === key;
    if (groupType === 'status') {
        if (key === STATUS_FILTERS.ALL) return true;
        if (key === STATUS_FILTERS.ENABLED) return !!pkg.isEnabled && !pkg.isCorrupt;
        if (key === STATUS_FILTERS.DISABLED) return !pkg.isEnabled && !pkg.isCorrupt;
        if (key === STATUS_FILTERS.MISSING_DEPS) return !!pkg.missingDeps?.length && !pkg.isCorrupt;
        if (key === STATUS_FILTERS.VERSION_CONFLICTS) return !!pkg.isDuplicate && !pkg.isCorrupt;
        if (key === STATUS_FILTERS.EXACT_DUPLICATES) return !!pkg.isExactDuplicate && !pkg.isCorrupt;
        if (key === STATUS_FILTERS.CORRUPT) return !!pkg.isCorrupt;
        if (key === STATUS_FILTERS.STANDALONE) return isStandalone(pkg) && !pkg.isCorrupt;
        if (key === STATUS_FILTERS.REMOVABLE) return !!pkg.isRemovable && !pkg.isCorrupt;
    }
    return false;
};

interface SidebarGroupMenuProps {
    anchor: { x: number; y: number };
    groupType: SidebarGroupType;
    groupKey: string;
    packages: VarPackage[];
    onClose: () => void;
}

/** Bulk actions for a right-clicked creator/type/status facet in the sidebar —
 * an `AnchoredMenu` configuration, the sibling of `ContextMenu`'s per-package menu. */
export const SidebarGroupMenu = ({ anchor, groupType, groupKey, packages, onClose }: SidebarGroupMenuProps) => {
    const { handleSidebarAction, handleDeleteClick } = useActionContext();

    const inContext = (pkg: VarPackage) => isPackageInContext(pkg, groupType, groupKey);
    const hasDisabled = packages.some(p => inContext(p) && !p.isEnabled);
    const hasEnabled = packages.some(p => inContext(p) && p.isEnabled);
    const hasConflicts = packages.some(p => inContext(p) && (p.isDuplicate || p.isExactDuplicate));
    // Cleanup is useful whenever there are actual conflicts, or whenever the
    // group is a Creator/Type grouping (manual cleanup across a facet).
    const showCleanup = hasConflicts || groupType === 'creator' || groupType === 'type';
    const corruptPkgs = groupType === 'status' && groupKey === STATUS_FILTERS.CORRUPT
        ? packages.filter(p => p.isCorrupt)
        : [];

    const hasEnableDisableSection = hasDisabled || hasEnabled;

    return (
        <AnchoredMenu anchor={anchor} onClose={onClose} className="min-w-[160px]">
            <div className="px-3 py-1 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-700/50 mb-1 truncate max-w-[200px]">
                {groupKey}
            </div>

            {hasDisabled && (
                <MenuItem icon={<CheckCircle2 size={14} className="text-green-500" />} onSelect={() => handleSidebarAction('enable-all', groupType, groupKey)}>
                    Enable All
                </MenuItem>
            )}
            {hasEnabled && (
                <MenuItem icon={<Power size={14} className="text-gray-400" />} onSelect={() => handleSidebarAction('disable-all', groupType, groupKey)}>
                    Disable All
                </MenuItem>
            )}

            {hasEnableDisableSection && showCleanup && <MenuDivider />}
            {showCleanup && (
                <MenuItem icon={<Sparkles size={14} className="text-purple-400" />} onSelect={() => handleSidebarAction('resolve-all', groupType, groupKey)}>
                    Package Cleanup
                </MenuItem>
            )}

            {(hasEnableDisableSection || showCleanup) && <MenuDivider />}
            <MenuItem icon={<Download size={14} className="text-blue-400" />} onSelect={() => handleSidebarAction('install-all', groupType, groupKey)}>
                Install All to Library
            </MenuItem>

            {corruptPkgs.length > 0 && (
                <>
                    <MenuDivider />
                    <MenuItem tone="danger" icon={<Trash2 size={14} className="text-red-400" />} onSelect={() => handleDeleteClick(corruptPkgs[0], corruptPkgs)}>
                        {`Delete (${corruptPkgs.length})`}
                    </MenuItem>
                </>
            )}
        </AnchoredMenu>
    );
};

export default SidebarGroupMenu;
