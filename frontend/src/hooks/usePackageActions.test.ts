import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePackageActions } from './usePackageActions';
import { VarPackage } from '../types';
import { stubMemoryLocalStorage } from '../test/memoryStorage';

const REFUSAL = 'A copy of this package already exists in the library; remove or resolve the duplicate first.';
const LIBRARY = '/library/main';

const makePackage = (fileName: string, isEnabled: boolean): VarPackage =>
    ({ filePath: `${LIBRARY}/${fileName}`, fileName, isEnabled } as VarPackage);

function jsonResponse(status: number, body: unknown) {
    return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function setup(packages: VarPackage[], selected: string[] = []) {
    const setPackages = vi.fn();
    const addToast = vi.fn();
    const hook = renderHook(() => usePackageActions(
        packages, setPackages, LIBRARY, vi.fn(), new Set(selected), vi.fn(), vi.fn(), addToast
    ));
    return { ...hook, setPackages, addToast };
}

describe('usePackageActions toggle refusals', () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        stubMemoryLocalStorage();
        fetchMock.mockReset();
        vi.stubGlobal('fetch', fetchMock);
        vi.spyOn(console, 'error').mockImplementation(() => { });
    });

    afterEach(() => {
        delete (window as any).go;
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('shows the server reason and leaves the list untouched when the web toggle is refused', async () => {
        fetchMock.mockResolvedValue(jsonResponse(409, { success: false, message: REFUSAL }));
        const target = makePackage('A.B.1.var', true);
        const { result, setPackages, addToast } = setup([target]);

        await act(async () => { await result.current.togglePackage(target); });

        expect(addToast).toHaveBeenCalledWith(`Failed to toggle: ${REFUSAL}`, 'error');
        expect(setPackages).not.toHaveBeenCalled();
        expect(result.current.collisionData.open).toBe(false);
    });

    it('shows the rejection text and leaves the list untouched when the desktop toggle is refused', async () => {
        (window as any).go = { main: { App: { TogglePackage: vi.fn().mockRejectedValue(REFUSAL) } } };
        const target = makePackage('A.B.1.var', true);
        const { result, setPackages, addToast } = setup([target]);

        await act(async () => { await result.current.togglePackage(target); });

        expect(addToast).toHaveBeenCalledWith(`Failed to toggle: ${REFUSAL}`, 'error');
        expect(setPackages).not.toHaveBeenCalled();
    });

    it('flips the package only after the backend confirms', async () => {
        const renamed = `${LIBRARY}/A.B.1.var.disabled`;
        fetchMock.mockResolvedValue(jsonResponse(200, { success: true, newPath: renamed }));
        const target = makePackage('A.B.1.var', true);
        const { result, setPackages, addToast } = setup([target]);

        await act(async () => { await result.current.togglePackage(target); });

        expect(addToast).toHaveBeenCalledWith('Package disabled', 'success');
        const apply = setPackages.mock.calls[0][0] as (prev: VarPackage[]) => VarPackage[];
        expect(apply([target])[0]).toMatchObject({ isEnabled: false, filePath: renamed });
    });

    it('reports why part of a bulk toggle was refused and flips only the packages that succeeded', async () => {
        const accepted = makePackage('A.B.1.var', true);
        const refused = makePackage('C.D.1.var', true);
        fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
            const { filePath } = JSON.parse(init.body as string);
            return filePath === refused.filePath
                ? jsonResponse(409, { success: false, message: REFUSAL })
                : jsonResponse(200, { success: true, newPath: `${filePath}.disabled` });
        });
        const { result, setPackages, addToast } = setup([accepted, refused], [accepted.filePath, refused.filePath]);

        await act(async () => { await result.current.handleBulkToggle(accepted); });

        expect(addToast).toHaveBeenCalledWith('Toggled 1 package(s) (1 failed)', 'success');
        expect(addToast).toHaveBeenCalledWith(`Not toggled: ${REFUSAL}`, 'warning');
        const apply = setPackages.mock.calls[0][0] as (prev: VarPackage[]) => VarPackage[];
        const [first, second] = apply([accepted, refused]);
        expect(first.isEnabled).toBe(false);
        expect(second.isEnabled).toBe(true);
    });

    it('reports the reason when every package in a bulk toggle is refused', async () => {
        fetchMock.mockResolvedValue(jsonResponse(409, { success: false, message: REFUSAL }));
        const first = makePackage('A.B.1.var', true);
        const second = makePackage('C.D.1.var', true);
        const { result, setPackages, addToast } = setup([first, second], [first.filePath, second.filePath]);

        await act(async () => { await result.current.handleBulkToggle(first); });

        expect(addToast).toHaveBeenCalledWith(`All toggles failed: ${REFUSAL}`, 'error');
        expect(setPackages).not.toHaveBeenCalled();
    });
});
