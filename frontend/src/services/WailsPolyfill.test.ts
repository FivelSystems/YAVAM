import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initWailsPolyfill } from './wails-polyfill';

describe('Wails Polyfill SSE Logic', () => {
    let mockEventSource: any;

    beforeEach(() => {
        // Mock Window.go (Force Web Mode)
        // @ts-ignore
        delete window.go;
        // @ts-ignore
        delete window.runtime; // Force Polyfill Init

        // Mock EventSource
        mockEventSource = {
            close: vi.fn(),
            onmessage: null,
            onerror: null,
        };

        const MockEventSource = vi.fn(function () {
            return mockEventSource;
        });
        globalThis.EventSource = MockEventSource as any;

        // Timer Mock
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
    });

    it('should stop reconnecting if auth:logout event is fired', () => {
        initWailsPolyfill();
        expect(globalThis.EventSource).toHaveBeenCalled();

        // Simulate Error
        mockEventSource.onerror(new Event('error'));
        expect(mockEventSource.close).toHaveBeenCalled();

        // Fire Logout Event
        window.dispatchEvent(new Event('auth:logout'));

        // Fast forward time
        vi.advanceTimersByTime(6000);

        // Should NOT have reconnected
        expect(globalThis.EventSource).toHaveBeenCalledTimes(1);
    });

    it('should reconnect on auth:login event', () => {
        // ... (Similar logic)
    });
});
