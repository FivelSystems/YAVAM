/**
 * packageDependencyAnalysis.ts
 * 
 * Provides utility functions for analyzing detailed package relationships within the frontend.
 * 
 * Key Features:
 * - Builds a Reverse Dependency Map (Who uses X?).
 * - Identifies "Orphan" packages (Packages with 0 incoming dependencies, excluding Root Types).
 * 
 * Performance Note: 
 * Optimized to run in O(N) where N is total dependencies across all packages.
 * Designed to run once per scan completion.
 */

import { VarPackage } from '../types';

// const ROOT_TYPES = new Set(['Scene', 'Look', 'Clothing', 'Hair', 'Preset']);

export interface GraphAnalysisResult {
    orphans: Set<string>;
    reverseDeps: Map<string, Set<string>>;
}

/**
 * Analyzes the entire package set to build a dependency graph and identify orphans.
 * @param packages Full list of packages from the library.
 * @returns {GraphAnalysisResult} Contains the set of orphan filePaths and the reverse dependency map.
 */
/**
 * Analyzes the entire package set to build a dependency graph and identify orphans.
 * @param packages Full list of packages from the library.
 * @returns {GraphAnalysisResult} Contains the set of orphan filePaths and the reverse dependency map.
 */
export const analyzeGraph = (packages: VarPackage[]): GraphAnalysisResult => {
    const reverseDeps = new Map<string, Set<string>>();
    // pkgIdMap is local for orphan lookup, also key by lower
    const pkgIdMap = new Map<string, VarPackage>();

    // Helper to extract base ID (Creator.Package)
    const getBaseId = (creator: string, pkgName: string) => `${creator}.${pkgName}`.toLowerCase();

    // Secondary Index: BaseID -> List of {fullId, versionNum}
    const versionMap = new Map<string, { fullId: string, version: number }[]>();

    // 1. Initialize Map & Index
    packages.forEach(p => {
        if (p.isCorrupt || !p.meta.creator || !p.meta.packageName) return;

        const fullId = `${p.meta.creator}.${p.meta.packageName}.${p.meta.version}`;
        const fullIdLower = fullId.toLowerCase();

        pkgIdMap.set(fullIdLower, p);

        if (!reverseDeps.has(fullIdLower)) {
            reverseDeps.set(fullIdLower, new Set());
        }

        // Populate Version Map
        const baseId = getBaseId(p.meta.creator, p.meta.packageName);
        if (!versionMap.has(baseId)) {
            versionMap.set(baseId, []);
        }

        const verNum = parseInt(p.meta.version, 10);
        if (!isNaN(verNum)) {
            versionMap.get(baseId)?.push({ fullId: fullIdLower, version: verNum });
        }
    });

    // Sort versions desc for each package
    versionMap.forEach((list) => {
        list.sort((a, b) => b.version - a.version);
    });

    // 2. Build Reverse Graph
    packages.forEach(consumer => {
        // Even disabled packages count as usages (safety precaution)
        if (consumer.isCorrupt) return;
        if (!consumer.meta.dependencies) return;

        // CRITICAL FIX: Use Package ID for Consumer (Deduplication).
        const consumerId = `${consumer.meta.creator}.${consumer.meta.packageName}.${consumer.meta.version}`;

        Object.keys(consumer.meta.dependencies).forEach(depId => {
            const depIdLower = depId.toLowerCase();

            // Check for Exact Match first
            if (reverseDeps.has(depIdLower)) {
                reverseDeps.get(depIdLower)?.add(consumerId);
                return;
            }

            // Handle "latest" or missing version resolution
            if (depIdLower.endsWith('.latest')) {
                const baseDep = depIdLower.slice(0, -7);
                const versions = versionMap.get(baseDep);
                if (versions && versions.length > 0) {
                    const latestId = versions[0].fullId.toLowerCase();
                    reverseDeps.get(latestId)?.add(consumerId);
                }
            } else {
                // RECURSIVE BASE LOOKUP (Unified Logic)
                // If exact match fails, try stripping segments to find a Base ID.
                let tempBase = depIdLower;
                while (tempBase.includes('.')) {
                    const lastDot = tempBase.lastIndexOf('.');
                    if (lastDot === -1) break;
                    tempBase = tempBase.substring(0, lastDot);

                    // Check if this matches a known Base ID (Creator.Package)
                    const versions = versionMap.get(tempBase);
                    if (versions && versions.length > 0) {
                        // Matched a base! 
                        // Logic: If referencing "Creator.Pkg", we assume it maps to the Latest Available Version for "Used By" purposes.
                        // Or should we map to ALL versions? 
                        // User Benefit: "Latest" is the most likely functionality.
                        // And `usePackages` generally resolves to "Any" enabled.
                        // Let's map to the LATEST version to keep the graph clean.
                        const latestId = versions[0].fullId.toLowerCase();
                        reverseDeps.get(latestId)?.add(consumerId);
                        break; // Stop once matched
                    }
                }
            }
        });
    });

    // 3. Identify Orphans
    const orphans = new Set<string>();
    reverseDeps.forEach((consumers, pkgIdLower) => {
        if (consumers.size === 0) {
            const pkg = pkgIdMap.get(pkgIdLower);
            if (pkg) {
                orphans.add(pkg.filePath);
            }
        }
    });

    return { orphans, reverseDeps };
};

export interface ImpactAnalysis {
    cascade: string[]; // List of additional filePaths that will be deleted
    preserved: string[]; // List of dependencies that are safe/shared
}

/**
 * Simulates a deletion to determine cascading effects.
 * @param targets List of filePaths to simulate deleting.
 * @param packages Full library of packages (for forward deps lookup).
 * @param reverseDeps The current reverse dependency map (from analyzeGraph).
 */
export const getImpact = (targets: string[], packages: VarPackage[], reverseDeps: Map<string, Set<string>>): ImpactAnalysis => {
    // 1. Build Lookup Maps (O(N))
    const idToFiles = new Map<string, Set<string>>();

    packages.forEach(p => {
        if (p.isCorrupt || !p.meta.creator) return;
        const id = `${p.meta.creator}.${p.meta.packageName}.${p.meta.version}`.toLowerCase();
        if (!idToFiles.has(id)) idToFiles.set(id, new Set());
        idToFiles.get(id)?.add(p.filePath);
    });

    // 2. Setup Initial State
    // We track deleted FILES (specific instances)
    const deletedFiles = new Set<string>(targets);
    const cascadeFiles = new Set<string>();

    // 3. Recursive Simulation
    let changed = true;
    while (changed) {
        changed = false;

        for (const [providerId, consumerPaths] of reverseDeps.entries()) {
            // Logic: A ProviderID (abstract concept) is "unused" only if ALL its consumer FILES are deleted.
            // If even one consumer file remains, the ProviderID is still needed.

            // Note: We don't track "deletedIds" because deleting one COPY doesn't delete the ID.
            // We only care if the ProviderID has lost all its users.

            if (consumerPaths.size === 0) continue; // Already orphan

            // Check if all consumers are gone
            let allConsumersDeleted = true;
            for (const consumerPath of consumerPaths) {
                if (!deletedFiles.has(consumerPath)) {
                    allConsumersDeleted = false;
                    break;
                }
            }

            if (allConsumersDeleted) {
                // If ID is now unused, ALL files providing this ID are now candidates for deletion (Cascade)
                // (Assuming we want to purge unused dependencies completely)
                const providers = idToFiles.get(providerId);
                if (providers) {
                    for (const provPath of providers) {
                        if (!deletedFiles.has(provPath)) {
                            deletedFiles.add(provPath);
                            cascadeFiles.add(provPath);
                            changed = true;
                        }
                    }
                }
            }
        }
    }

    return {
        cascade: Array.from(cascadeFiles),
        preserved: []
    };
};

/**
 * Retrieves ALL dependencies for a set of packages, recursively.
 * USED FOR: "Purge All Dependencies" (Dangerous Mode).
 * Matches logic of "getImpact" but ignores reference counting.
 */
export const getAllDependencies = (targets: string[], packages: VarPackage[]): string[] => {
    // 1. Indexing (O(N))
    const fileToPkg = new Map<string, VarPackage>();
    const idToPkg = new Map<string, VarPackage>();
    // Map BaseID -> LatestVersion for "latest" resolution
    const baseIdVersionMap = new Map<string, VarPackage>();

    packages.forEach(p => {
        if (p.isCorrupt || !p.meta.creator) return;
        fileToPkg.set(p.filePath, p);
        const id = `${p.meta.creator}.${p.meta.packageName}.${p.meta.version}`.toLowerCase();
        idToPkg.set(id, p);

        const baseId = `${p.meta.creator}.${p.meta.packageName}`.toLowerCase();
        const existing = baseIdVersionMap.get(baseId);
        if (!existing || (parseInt(p.meta.version) > parseInt(existing.meta.version))) {
            baseIdVersionMap.set(baseId, p);
        }
    });

    const dependencies = new Set<string>();
    const queue = [...targets];
    const processed = new Set<string>();

    // 2. Traversal
    while (queue.length > 0) {
        const currentPath = queue.shift()!;
        if (processed.has(currentPath)) continue;
        processed.add(currentPath);

        const pkg = fileToPkg.get(currentPath);
        if (!pkg || !pkg.meta.dependencies) continue;

        Object.keys(pkg.meta.dependencies).forEach(depId => {
            let resolvedPkg: VarPackage | undefined;

            if (depId.endsWith('.latest')) {
                const baseId = depId.slice(0, -7).toLowerCase();
                resolvedPkg = baseIdVersionMap.get(baseId);
            } else {
                resolvedPkg = idToPkg.get(depId.toLowerCase());
            }

            if (resolvedPkg && !processed.has(resolvedPkg.filePath) && !targets.includes(resolvedPkg.filePath)) {
                dependencies.add(resolvedPkg.filePath);
                queue.push(resolvedPkg.filePath); // Recurse
            }
        });
    }

    return Array.from(dependencies);
};
