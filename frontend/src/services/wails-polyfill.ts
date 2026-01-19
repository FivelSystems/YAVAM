
// This polyfill provides Wails-compatible Runtime API for Web Mode
// It connects to Server-Sent Events (SSE) and dispatches them as Wails Events.

declare global {
    interface Window {
        runtime: any;
        go: any;
    }
}

const listeners = new Map<string, ((data: any) => void)[]>();
let eventSource: EventSource | null = null;
let reconnectTimer: any = null;

function connectSSE() {
    if (eventSource) return;

    console.log("[Polyfill] Connecting to SSE...");
    const token = localStorage.getItem('yavam_auth_token');
    const url = token ? `/api/events?token=${encodeURIComponent(token)}` : '/api/events';
    eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
        try {
            // Keep-alive check
            if (event.data === ": keep-alive") return;

            const msg = JSON.parse(event.data);
            if (msg && msg.event) {
                const callbacks = listeners.get(msg.event);
                if (callbacks) {
                    callbacks.forEach(cb => cb(msg.data));
                }
            }
        } catch (e) {
            console.error("[Polyfill] Failed to parse SSE message:", e);
        }
    };

    eventSource.onerror = (_err) => {
        // console.error("[Polyfill] SSE Error:", err);
        if (eventSource) {
            eventSource.close();
            eventSource = null;
        }
        if (!reconnectTimer) {
            reconnectTimer = setTimeout(() => {
                reconnectTimer = null;
                connectSSE();
            }, 5000);
        }
    };
}

export function initWailsPolyfill() {
    // Only run if NOT in Wails (Desktop) mode
    if (window.go) {
        console.log("[Polyfill] Wails detected, skipping polyfill.");
        return;
    }

    console.log("[Polyfill] Initializing Web Runtime...");

    window.runtime = window.runtime || {};

    // Polyfill EventsOn
    window.runtime.EventsOn = (eventName: string, callback: (data: any) => void) => {
        if (!listeners.has(eventName)) {
            listeners.set(eventName, []);
        }
        listeners.get(eventName)?.push(callback);
    };

    // Polyfill EventsOff
    window.runtime.EventsOff = (eventName: string, repeatedCallback?: (data: any) => void) => {
        if (!listeners.has(eventName)) return;
        if (!repeatedCallback) {
            listeners.delete(eventName);
        } else {
            const list = listeners.get(eventName) || [];
            listeners.set(eventName, list.filter(cb => cb !== repeatedCallback));
        }
    };

    // Polyfill EventsEmit (Optional, for completeness)
    window.runtime.EventsEmit = (eventName: string, data?: any) => {
        // In local mode, we might just loopback?
        // Or send to server? For now, simple loopback for local logic.
        const callbacks = listeners.get(eventName);
        if (callbacks) {
            callbacks.forEach(cb => cb(data));
        }
    };

    // Polyfill BrowserOpenURL
    window.runtime.BrowserOpenURL = (url: string) => {
        window.open(url, '_blank');
    };

    // Start SSE connection
    connectSSE();
}
