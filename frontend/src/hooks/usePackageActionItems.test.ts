import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePackageActionItems } from './usePackageActionItems';
import { VarPackage } from '../types';

const basePkg = {
    filePath: 'C:/lib/Creator.Pkg.1.var',
    fileName: 'Creator.Pkg.1.var',
    size: 100,
    isEnabled: true,
    isCorrupt: false,
    isDuplicate: false,
    isExactDuplicate: false,
    missingDeps: [],
    hasThumbnail: false,
    categories: [],
    scanPhase: 'analyzed',
    meta: { creator: 'Creator', packageName: 'Pkg', version: '1', dependencies: {} },
} as unknown as VarPackage;

const callbacks = () => ({
    onToggle: vi.fn(),
    onOpenFolder: vi.fn(),
    onDownload: vi.fn(),
    onCopyPath: vi.fn(),
    onCopyFiles: vi.fn(),
    onCutFile: vi.fn(),
    onDelete: vi.fn(),
    onMerge: vi.fn(),
    onMergeInPlace: vi.fn(),
    onResolve: vi.fn(),
});

const byKey = (items: ReturnType<typeof usePackageActionItems>, key: string) => items.find(i => i.key === key);

describe('usePackageActionItems — single source of truth for ContextMenu and ActionSheet', () => {
    it('returns an empty list when there is no package', () => {
        const { result } = renderHook(() => usePackageActionItems({ pkg: null, selectedCount: 0, isWeb: false, ...callbacks() }));
        expect(result.current).toEqual([]);
    });

    it('hides merge actions unless the package is an exact duplicate', () => {
        const { result } = renderHook(() => usePackageActionItems({ pkg: basePkg, selectedCount: 1, isWeb: false, ...callbacks() }));
        expect(byKey(result.current, 'merge-root')?.hidden).toBe(true);
        expect(byKey(result.current, 'merge-in-place')?.hidden).toBe(true);
    });

    it('shows merge actions for an exact duplicate', () => {
        const pkg = { ...basePkg, isExactDuplicate: true };
        const { result } = renderHook(() => usePackageActionItems({ pkg, selectedCount: 1, isWeb: false, ...callbacks() }));
        expect(byKey(result.current, 'merge-root')?.hidden).toBe(false);
        expect(byKey(result.current, 'merge-in-place')?.hidden).toBe(false);
    });

    it('shows "Fix Obsolete" only for a non-exact duplicate', () => {
        const dup = { ...basePkg, isDuplicate: true, isExactDuplicate: false };
        const { result: dupResult } = renderHook(() => usePackageActionItems({ pkg: dup, selectedCount: 1, isWeb: false, ...callbacks() }));
        expect(byKey(dupResult.current, 'resolve')?.hidden).toBe(false);

        const exact = { ...basePkg, isDuplicate: true, isExactDuplicate: true };
        const { result: exactResult } = renderHook(() => usePackageActionItems({ pkg: exact, selectedCount: 1, isWeb: false, ...callbacks() }));
        expect(byKey(exactResult.current, 'resolve')?.hidden).toBe(true);
    });

    it('hides filesystem-only actions on web and shows the direct-download row instead', () => {
        const { result } = renderHook(() => usePackageActionItems({ pkg: basePkg, selectedCount: 1, isWeb: true, ...callbacks() }));
        expect(byKey(result.current, 'open-folder')?.hidden).toBe(true);
        expect(byKey(result.current, 'copy-file')?.hidden).toBe(true);
        expect(byKey(result.current, 'cut-file')?.hidden).toBe(true);
        expect(byKey(result.current, 'download-file')?.hidden).toBe(false);
        expect(byKey(result.current, 'install')?.hidden).toBeFalsy();
    });

    it('shows filesystem-only actions on desktop and hides the direct-download row', () => {
        const { result } = renderHook(() => usePackageActionItems({ pkg: basePkg, selectedCount: 1, isWeb: false, ...callbacks() }));
        expect(byKey(result.current, 'open-folder')?.hidden).toBeFalsy();
        expect(byKey(result.current, 'copy-file')?.hidden).toBeFalsy();
        expect(byKey(result.current, 'cut-file')?.hidden).toBeFalsy();
        expect(byKey(result.current, 'download-file')?.hidden).toBe(true);
    });

    it('labels toggle/delete/copy by enabled state and selection count', () => {
        const cbs = callbacks();
        const enabled = { ...basePkg, isEnabled: true };
        const { result: single } = renderHook(() => usePackageActionItems({ pkg: enabled, selectedCount: 1, isWeb: false, ...cbs }));
        expect(byKey(single.current, 'toggle')?.label).toBe('Disable');
        expect(byKey(single.current, 'delete')?.label).toBe('Delete');
        expect(byKey(single.current, 'copy-file')?.label).toBe('Copy File');

        const disabled = { ...basePkg, isEnabled: false };
        const { result: multi } = renderHook(() => usePackageActionItems({ pkg: disabled, selectedCount: 3, isWeb: false, ...cbs }));
        expect(byKey(multi.current, 'toggle')?.label).toBe('Toggle Selected');
        expect(byKey(multi.current, 'delete')?.label).toBe('Delete (3)');
        expect(byKey(multi.current, 'copy-file')?.label).toBe('Copy Selected Files');
    });

    it('marks delete with danger tone and wires each item to its callback', () => {
        const cbs = callbacks();
        const { result } = renderHook(() => usePackageActionItems({ pkg: basePkg, selectedCount: 1, isWeb: false, ...cbs }));

        expect(byKey(result.current, 'delete')?.tone).toBe('danger');
        expect(byKey(result.current, 'toggle')?.tone).toBeUndefined();

        byKey(result.current, 'delete')?.onClick();
        expect(cbs.onDelete).toHaveBeenCalledWith(basePkg);

        byKey(result.current, 'copy-path')?.onClick();
        expect(cbs.onCopyPath).toHaveBeenCalledWith(basePkg);
    });
});
