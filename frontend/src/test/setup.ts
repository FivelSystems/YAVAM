import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { stubMemoryLocalStorage } from './memoryStorage';

// Re-checked before every test: tests that call vi.unstubAllGlobals() would otherwise bring the unusable global back.
beforeEach(() => {
    if (typeof globalThis.localStorage?.setItem !== 'function') stubMemoryLocalStorage();
});

// Runs a cleanup after each test case (e.g. clearing jsdom)
afterEach(() => {
    cleanup();
});

// Mock Wails Runtime if needed globally
// @ts-ignore
window.runtime = window.runtime || {
    // @ts-ignore
    EventsOn: () => { },
    // @ts-ignore
    EventsOff: () => { },
};

// Mock ResizeObserver (Radix UI / Recharts often need this)
globalThis.ResizeObserver = class ResizeObserver {
    observe() { }
    unobserve() { }
    disconnect() { }
};
