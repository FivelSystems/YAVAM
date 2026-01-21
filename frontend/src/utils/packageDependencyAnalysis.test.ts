
import { describe, it, expect } from 'vitest';
import { analyzeGraph } from './packageDependencyAnalysis';
import { VarPackage } from '../types';

describe('packageDependencyAnalysis', () => {
    describe('analyzeGraph', () => {
        it('resolves exact matches correctly', () => {
            // Dependencies keys are typically lowercased in normalization or used as is?
            // The code uses Object.keys(consumer.meta.dependencies), then depId.toLowerCase().
            // So key in dependency map doesn't matter, but value matches ID logic.
            const packages = [
                mockPkg('C', 'D', '1'),
                mockPkg('User', 'Exact', '1', { 'C.D.1': '' })
            ];
            const result = analyzeGraph(packages);
            // ReverseDeps keys are lowercased. Values are as constructed (Mixed Case)
            expect(result.reverseDeps.get('c.d.1')?.has('User.Exact.1')).toBe(true);
        });

        it('resolves fuzzy matches (v1 -> 1) correctly', () => {
            const packages = [
                mockPkg('C', 'D', '1'),
                mockPkg('C', 'D', '2'), // Latest
                mockPkg('User', 'Fuzzy', '1', { 'C.D.v1': '' })
            ];
            const result = analyzeGraph(packages);

            // Should match v1 specific version, NOT latest (2)
            expect(result.reverseDeps.get('c.d.1')?.has('User.Fuzzy.1')).toBe(true);

            // Ensure strict non-match
            const latestSet = result.reverseDeps.get('c.d.2');
            if (latestSet) {
                expect(latestSet.has('User.Fuzzy.1')).toBeFalsy();
            }
        });

        it('resolves fuzzy matches (version1 -> 1) correctly', () => {
            const packages = [
                mockPkg('C', 'D', '1'),
                mockPkg('User', 'Verbose', '1', { 'C.D.version1': '' })
            ];
            const result = analyzeGraph(packages);
            expect(result.reverseDeps.get('c.d.1')?.has('User.Verbose.1')).toBe(true);
        });

        it('fallbacks to latest if no version match found', () => {
            const packages = [
                mockPkg('C', 'D', '1'),
                mockPkg('C', 'D', '2'), // Latest
                mockPkg('User', 'Fall', '1', { 'C.D.v3': '' }) // v3 doesn't exist
            ];
            const result = analyzeGraph(packages);

            // Should fallback to latest (2)
            expect(result.reverseDeps.get('c.d.2')?.has('User.Fall.1')).toBe(true);
        });
    });
});

function mockPkg(creator: string, pkg: string, ver: string, deps: Record<string, string> = {}): VarPackage {
    return {
        // Mocking structure
        filePath: `path/${creator}.${pkg}.${ver}.var`,
        size: 0,
        date: '',
        isCorrupt: false,
        isEnabled: true,
        meta: {
            creator,
            packageName: pkg,
            version: ver,
            dependencies: deps,
            description: '',
            licenseType: ''
        }
    } as unknown as VarPackage;
}
