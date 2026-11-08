import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useLibrary } from './useLibrary';

const NEW_LIBRARY = 'D:\\Libs\\New';

let callOrder: string[] = [];
let hostLibraries: string[] | null = null;

beforeEach(() => {
    localStorage.clear();
    callOrder = [];
    hostLibraries = null;
    (window as unknown as { go: unknown }).go = {
        main: {
            App: {
                GetConfig: vi.fn(async () => ({ setupDone: true, libraries: hostLibraries })),
                AddConfiguredLibrary: vi.fn(async () => { callOrder.push('host-add'); }),
            },
        },
    };
});

afterEach(() => {
    delete (window as unknown as { go?: unknown }).go;
});

describe('useLibrary', () => {
    it('reports the host libraries as loaded only once the host has answered', async () => {
        localStorage.setItem('activeLibraryPath', 'D:\\Libs\\Stale');
        const { result } = renderHook(useLibrary);
        expect(result.current.hostLibrariesLoaded).toBe(false);

        await waitFor(() => expect(result.current.hostLibrariesLoaded).toBe(true));
    });

    it('forgets a remembered library when the host lists none', async () => {
        localStorage.setItem('activeLibraryPath', 'D:\\Libs\\Stale');
        const { result } = renderHook(useLibrary);

        await waitFor(() => expect(result.current.activeLibraryPath).toBe(''));
        expect(localStorage.getItem('activeLibraryPath')).toBeNull();
    });

    it('makes the first library added to an empty host the active one, after the host knows it', async () => {
        const { result } = renderHook(useLibrary);
        await waitFor(() => expect(result.current.needsSetup).toBe(false));

        await act(async () => { await result.current.addLibrary(NEW_LIBRARY); });
        callOrder.push('state-applied');

        expect(callOrder).toEqual(['host-add', 'state-applied']);
        expect(result.current.libraries).toEqual([NEW_LIBRARY]);
        expect(result.current.activeLibraryPath).toBe(NEW_LIBRARY);
        expect(result.current.activeLibIndex).toBe(0);
    });

    it('does not add a library the host refused', async () => {
        const { result } = renderHook(useLibrary);
        await waitFor(() => expect(result.current.needsSetup).toBe(false));
        (window as unknown as { go: { main: { App: { AddConfiguredLibrary: unknown } } } })
            .go.main.App.AddConfiguredLibrary = vi.fn(async () => { throw new Error('refused'); });
        vi.spyOn(console, 'error').mockImplementation(() => undefined);

        await act(async () => { await result.current.addLibrary(NEW_LIBRARY); });

        expect(result.current.libraries).toEqual([]);
        expect(result.current.activeLibraryPath).toBe('');
    });
});
