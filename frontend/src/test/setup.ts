import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

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
