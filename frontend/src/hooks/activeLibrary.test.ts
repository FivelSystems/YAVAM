import { describe, it, expect } from 'vitest';
import { resolveActiveLibrary } from './activeLibrary';

describe('resolveActiveLibrary', () => {
    const hostLibraries = ['D:\\Libs\\One', 'D:\\Libs\\Two'];

    it('keeps the remembered path while the host still lists it, ignoring case', () => {
        expect(resolveActiveLibrary(hostLibraries, 'd:\\libs\\two')).toEqual({ path: 'd:\\libs\\two', index: 1 });
    });

    it('falls back to the first library when the remembered path is no longer listed', () => {
        expect(resolveActiveLibrary(hostLibraries, 'D:\\Gone')).toEqual({ path: 'D:\\Libs\\One', index: 0 });
    });

    it('has no active library when the host lists none, so a stale path is not scanned', () => {
        expect(resolveActiveLibrary([], 'D:\\Libs\\One')).toEqual({ path: '', index: 0 });
    });
});
