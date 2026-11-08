export interface ActiveLibrary {
    path: string;
    index: number;
}

const sameLibraryPath = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * The host decides which libraries exist, so a path remembered by the client
 * is only kept while the host still lists it. With no libraries there is no
 * active one, which stops the client from requesting a scan of a stale path.
 */
export const resolveActiveLibrary = (hostLibraries: string[], rememberedPath: string): ActiveLibrary => {
    const rememberedIndex = hostLibraries.findIndex(library => sameLibraryPath(library, rememberedPath));
    if (rememberedIndex !== -1) return { path: hostLibraries[rememberedIndex], index: rememberedIndex };
    if (hostLibraries.length > 0) return { path: hostLibraries[0], index: 0 };
    return { path: "", index: 0 };
};

export const rememberActiveLibrary = (hostLibraries: string[], active: ActiveLibrary) => {
    try {
        localStorage.setItem("savedLibraries", JSON.stringify(hostLibraries));
        if (active.path) {
            localStorage.setItem("activeLibraryPath", active.path);
        } else {
            localStorage.removeItem("activeLibraryPath");
        }
    } catch {
        // Storage can be unavailable (private mode); the in-memory state is still correct.
    }
};
