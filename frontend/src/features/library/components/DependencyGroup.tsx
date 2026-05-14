import { useMemo } from 'react';
import { VarPackage } from '../../../types';
import { formatBytes } from '../../../utils/format';
import { DependencyRow } from './DependencyRow';

export interface DependencyGroupItem {
    pkg?: VarPackage;
    missingId?: string;
    targetId: string;
    depth?: number;
}

interface DependencyGroupProps {
    title: string;
    items: DependencyGroupItem[];
    emptyMessage?: string;
    onItemClick: (targetId: string) => void;
    onItemContextMenu?: (pkg: VarPackage, e: React.MouseEvent) => void;
}

export const DependencyGroup = ({ title, items, emptyMessage = "No items.", onItemClick, onItemContextMenu }: DependencyGroupProps) => {
    const totalSize = useMemo(() => items.reduce((sum, item) => sum + (item.pkg?.size || 0), 0), [items]);

    return (
        <div className="space-y-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex justify-between items-center">
                {title}
                <div className="flex items-center gap-2">
                    {totalSize > 0 && (
                        <span className="text-gray-400 font-mono text-[10px]">
                            {formatBytes(totalSize)}
                        </span>
                    )}
                    {items.length > 0 && (
                        <span className="text-gray-600">{items.length}</span>
                    )}
                </div>
            </h3>

            <div className="space-y-1">
                {items.length === 0 ? (
                    <div className="text-xs text-gray-600 italic">{emptyMessage}</div>
                ) : (
                    items.map(item => (
                        <DependencyRow
                            key={`${item.targetId}-${item.depth || 0}`}
                            pkg={item.pkg}
                            missingId={item.missingId}
                            indentLevel={item.depth || 0}
                            onClick={() => {
                                if (!item.missingId) {
                                    onItemClick(item.targetId);
                                }
                            }}
                            onContextMenu={onItemContextMenu}
                        />
                    ))
                )}
            </div>
        </div>
    );
};
