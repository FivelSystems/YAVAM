import { VarPackage } from '../types';

export type DependencyStatus = 'valid' | 'mismatch' | 'missing' | 'scanning' | 'system';

export interface ResolveResult {
    status: DependencyStatus;
    pkg?: VarPackage;
}

/**
 * Resolves a dependency ID against a list of packages.
 * Use this to ensure consistent logic for "Exact" vs "Loose/Latest" matching across the app.
 */
export const resolveDependency = (depId: string, allPackages: VarPackage[]): ResolveResult => {
    if (!depId) return { status: 'missing' };

    const cleanDep = depId.trim().toLowerCase();

    // System Check
    if (cleanDep.startsWith("vam.core")) return { status: 'system' };

    // 1. Exact Match
    // We try to find the exact ID. 
    // Optimization note: If this becomes a bottleneck, the caller should provide a Map instead of Array.
    const exact = allPackages.find(p => {
        if (!p.meta || !p.meta.creator) return false;
        const id = `${p.meta.creator}.${p.meta.packageName}.${p.meta.version}`;
        return id.toLowerCase() === cleanDep;
    });

    if (exact) return { status: 'valid', pkg: exact };

    // 2. Loose Match (Latest or Version Mismatch)
    const parts = cleanDep.split('.');
    if (parts.length >= 2) {
        const creator = parts[0];
        const pkgName = parts[1];

        // Find all candidates with matching Creator.Package
        const candidates = allPackages.filter(p =>
            p.meta &&
            (p.meta.creator || "").toLowerCase() === creator &&
            (p.meta.packageName || "").toLowerCase() === pkgName
        );

        if (candidates.length > 0) {
            // Sort by version descending (Numeric aware)
            candidates.sort((a, b) => {
                const vA = parseInt(a.meta.version) || 0;
                const vB = parseInt(b.meta.version) || 0;
                if (vA !== vB) return vB - vA;
                return (b.meta.version || "").localeCompare(a.meta.version || "");
            });

            const best = candidates[0];

            // If the dependency explicitly asked for ".latest", it's a valid match.
            // Otherwise, it's a "mismatch" (warn user but can technically work).
            if (parts[2] && parts[2].toLowerCase() === 'latest') return { status: 'valid', pkg: best };

            return { status: 'mismatch', pkg: best };
        }
    }

    return { status: 'missing' };
};

/**
 * Recursively resolves all dependencies for a list of packages (BFS).
 * Returns a flat list of unique VarPackages, including the inputs.
 */
export interface ResolvedNode {
    pkg: VarPackage;
    depth: number;
}

/**
 * Recursively resolves all dependencies for a list of packages (BFS).
 * Returns a flat list of unique VarPackages with their depth, including the inputs (depth 0).
 */
export const resolveRecursive = (startPackages: VarPackage[], allPackages: VarPackage[]): ResolvedNode[] => {
    const minDepthMap = new Map<string, number>(); // filePath -> minDepth
    const pkgMap = new Map<string, VarPackage>();

    // Queue stores { pkg, depth }
    const queue: ResolvedNode[] = startPackages.map(p => ({ pkg: p, depth: 0 }));

    while (queue.length > 0) {
        const { pkg: current, depth } = queue.shift()!;

        // Update minDepth if undefined or if we found a shorter path (BFS guarantees shortest first, but just in case)
        if (!minDepthMap.has(current.filePath) || depth < minDepthMap.get(current.filePath)!) {
            minDepthMap.set(current.filePath, depth);
            pkgMap.set(current.filePath, current);
        } else {
            // Already processed at a lower or equal depth
            continue;
        }

        if (current.meta && current.meta.dependencies) {
            for (const depId of Object.keys(current.meta.dependencies)) {
                const res = resolveDependency(depId, allPackages);
                if (res.pkg) {
                    queue.push({ pkg: res.pkg, depth: depth + 1 });
                }
            }
        }
    }

    // Convert map to array
    const result: ResolvedNode[] = [];
    minDepthMap.forEach((depth, path) => {
        const p = pkgMap.get(path);
        if (p) result.push({ pkg: p, depth });
    });

    return result;
};

export interface DependencySummary {
    nodes: ResolvedNode[];
    missing: string[];
    totalSize: number;
}

/**
 * Returns a complete summary of a package's dependencies including sorted nodes, missing direct deps, and total size.
 * Useful for UI components that need to render a clean dependency list.
 */
export const getDependencySummary = (pkg: VarPackage, allPackages: VarPackage[]): DependencySummary => {
    const directDepsKeys = pkg.meta && pkg.meta.dependencies ? Object.keys(pkg.meta.dependencies) : [];

    // Get Nodes with Depth, excluding the root package itself
    const foundNodes = resolveRecursive([pkg], allPackages).filter(n => n.pkg.filePath !== pkg.filePath);

    // Find Missing Direct Dependencies
    const missingDirectIds = directDepsKeys.filter(key => {
        const res = resolveDependency(key, allPackages);
        return res.status === 'missing';
    });

    // Sort: Depth ascending (0, 1, 2) then Alphabetical
    const sortedNodes = [...foundNodes].sort((a, b) => {
        if (a.depth !== b.depth) return a.depth - b.depth;
        return a.pkg.fileName.localeCompare(b.pkg.fileName);
    });

    const totalSize = sortedNodes.reduce((sum, node) => sum + node.pkg.size, 0);

    return { nodes: sortedNodes, missing: missingDirectIds, totalSize };
};
