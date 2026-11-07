
// This polyfill provides Wails-compatible Runtime API for Web Mode
// It connects to Server-Sent Events (SSE) and dispatches them as Wails Events.

import { getStoredToken, logout } from './auth';
import { TicketedEventStream } from './ticketedEventStream';

declare global {
    interface Window {
        runtime: any;
        go: any;
    }
}

const listeners = new Map<string, ((data: any) => void)[]>();
let isRevoked = false; // Prevent reconnect loop if logged out

function dispatchServerEvent(event: MessageEvent) {
    try {
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
}

const eventStream = new TicketedEventStream({
    fetch: (...args) => window.fetch(...args),
    EventSource: class { constructor(url: string) { return new window.EventSource(url); } } as unknown as typeof EventSource,
    getToken: getStoredToken,
    onSessionEnded: logout,
    onMessage: dispatchServerEvent,
});

function disconnectSSE() {
    eventStream.stop();
}

function connectSSE() {
    if (isRevoked) return;
    console.log("[Polyfill] Connecting to SSE...");
    eventStream.start();
}

// Logic to handle Auth State Changes
function handleLogout() {
    console.log("[Polyfill] Auth Logout detected. Stopping SSE.");
    isRevoked = true;
    disconnectSSE();
}

function handleLogin() {
    console.log("[Polyfill] Auth Login detected. Starting SSE.");
    isRevoked = false;
    connectSSE();
}

export function initWailsPolyfill() {
    // Only run if NOT in Wails (Desktop) mode
    if (window.go) {
        console.log("[Polyfill] Wails detected, skipping polyfill.");
        return;
    }

    // Check if initialized already?
    if (window.runtime && window.runtime.EventsOn) return;

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
        const callbacks = listeners.get(eventName);
        if (callbacks) {
            callbacks.forEach(cb => cb(data));
        }
    };

    // Polyfill BrowserOpenURL
    window.runtime.BrowserOpenURL = (url: string) => {
        window.open(url, '_blank');
    };

    // Listen to Auth Events
    window.addEventListener('auth:logout', handleLogout);
    window.addEventListener('auth:login', handleLogin);

    // Start SSE connection
    connectSSE();
}
