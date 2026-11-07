import { vi } from 'vitest';

// Some Node versions ship a global localStorage that shadows jsdom's and is unusable without a backing file.
export function stubMemoryLocalStorage(): Map<string, string> {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, value); },
        removeItem: (key: string) => { store.delete(key); },
        clear: () => store.clear(),
    });
    return store;
}
