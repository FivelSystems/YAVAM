
// Mock analyzeGraph based on fix implementation
const analyzeGraph = (packages) => {
    const reverseDeps = new Map();
    const pkgIdMap = new Map();

    const getBaseId = (creator, pkgName) => `${creator}.${pkgName}`.toLowerCase();
    const versionMap = new Map();

    // 1. Initialize
    packages.forEach(p => {
        if (!p.meta.creator) return;
        const fullId = `${p.meta.creator}.${p.meta.packageName}.${p.meta.version}`;
        const fullIdLower = fullId.toLowerCase();

        // Mock filePath if missing
        if (!p.filePath) p.filePath = fullId;

        pkgIdMap.set(fullIdLower, p);
        if (!reverseDeps.has(fullIdLower)) reverseDeps.set(fullIdLower, new Set());

        const baseId = getBaseId(p.meta.creator, p.meta.packageName);
        if (!versionMap.has(baseId)) versionMap.set(baseId, []);

        const verNum = parseInt(p.meta.version, 10);
        if (!isNaN(verNum)) {
            versionMap.get(baseId).push({ fullId: fullIdLower, version: verNum });
        }
    });

    versionMap.forEach((list) => list.sort((a, b) => b.version - a.version));

    // 2. Build Reverse Graph
    packages.forEach(consumer => {
        if (!consumer.meta.dependencies) return;
        const consumerId = `${consumer.meta.creator}.${consumer.meta.packageName}.${consumer.meta.version}`;

        Object.keys(consumer.meta.dependencies).forEach(depId => {
            const depIdLower = depId.toLowerCase();

            // Check Exact
            if (reverseDeps.has(depIdLower)) {
                reverseDeps.get(depIdLower).add(consumerId);
                return;
            }

            if (depIdLower.endsWith('.latest')) {
                const baseDep = depIdLower.slice(0, -7);
                const versions = versionMap.get(baseDep);
                if (versions && versions.length > 0) {
                    reverseDeps.get(versions[0].fullId).add(consumerId);
                }
            } else {
                // Recursive Base Lookup
                let tempBase = depIdLower;
                while (tempBase.includes('.')) {
                    const lastDot = tempBase.lastIndexOf('.');
                    if (lastDot === -1) break;
                    tempBase = tempBase.substring(0, lastDot);

                    const versions = versionMap.get(tempBase);
                    if (versions && versions.length > 0) {

                        // NEW LOGIC: Fuzzy Match
                        const suffix = depIdLower.substring(tempBase.length + 1);
                        const verMatch = suffix.match(/^(?:v|version)?(\d+)/);

                        let matchedId = versions[0].fullId; // Default to Latest

                        if (verMatch) {
                            const requestedVer = parseInt(verMatch[1], 10);
                            const specificPkg = versions.find(v => v.version === requestedVer);
                            if (specificPkg) {
                                matchedId = specificPkg.fullId;
                            }
                        }

                        reverseDeps.get(matchedId).add(consumerId);
                        break;
                    }
                }
            }
        });
    });

    return reverseDeps;
};

// Test Data
const packages = [
    { meta: { creator: 'C', packageName: 'D', version: '1', dependencies: {} } },
    { meta: { creator: 'C', packageName: 'D', version: '2', dependencies: {} } },

    // User.Exact -> C.D.1 (Should match C.D.1)
    { meta: { creator: 'User', packageName: 'Exact', version: '1', dependencies: { 'C.D.1': '' } } },

    // User.Fuzzy -> C.D.v1 (Should match C.D.1)
    { meta: { creator: 'User', packageName: 'Fuzzy', version: '1', dependencies: { 'C.D.v1': '' } } },

    // User.Prefix -> C.D.version1 (Should match C.D.1)
    { meta: { creator: 'User', packageName: 'Prefix', version: '1', dependencies: { 'C.D.version1': '' } } },

    // User.Latest -> C.D (Should match C.D.2)
    { meta: { creator: 'User', packageName: 'Latest', version: '1', dependencies: { 'C.D': '' } } },
];

const results = analyzeGraph(packages);

console.log("Results:");
results.forEach((consumers, pkgId) => {
    if (pkgId.startsWith('c.d')) {
        console.log(`${pkgId} used by: [${Array.from(consumers).join(', ')}]`);
    }
});
