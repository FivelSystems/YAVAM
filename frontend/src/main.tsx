import React, { Component, ErrorInfo, ReactNode } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Helper component to trigger a crash from a child
const CrashChild = () => {
    throw new Error("This is a planned developer test crash. Success!");
    return null; // Unreachable
};

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null; errorInfo: ErrorInfo | null, copySuccess: boolean, shouldCrash: boolean }> {
    constructor(props: { children: ReactNode }) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null, copySuccess: false, shouldCrash: false };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error, shouldCrash: false };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("ErrorBoundary caught error:", error, errorInfo);
        this.setState({ errorInfo });
    }

    componentDidMount() {
        window.addEventListener('keydown', this.handleKeyDown);
    }

    componentWillUnmount() {
        window.removeEventListener('keydown', this.handleKeyDown);
    }

    handleKeyDown = (e: KeyboardEvent) => {
        // Intentional Crash: Ctrl + Alt + Shift + K
        if (e.ctrlKey && e.altKey && e.shiftKey && (e.key === 'K' || e.key === 'k')) {
            // Trigger crash by rendering a crashing child
            this.setState({ shouldCrash: true });
        }
    }

    handleCopyError = () => {
        const text = `Error: ${this.state.error?.toString()}\n\nStack:\n${this.state.errorInfo?.componentStack}`;
        navigator.clipboard.writeText(text);
        this.setState({ copySuccess: true });
        setTimeout(() => this.setState({ copySuccess: false }), 2000);
    }

    handleReportIssue = () => {
        // 1. Copy full details to clipboard (safest way to transfer large stack traces)
        const fullLog = `Error: ${this.state.error?.toString()}\n\nStack:\n${this.state.errorInfo?.componentStack}\n\nContext:\n- OS: Windows\n- App Version: (Please specify)`;
        navigator.clipboard.writeText(fullLog);
        this.setState({ copySuccess: true });
        setTimeout(() => this.setState({ copySuccess: false }), 2000);

        // 2. Open GitHub Issue (No params avoids shell errors)
        const url = "https://github.com/FivelSystems/YAVAM/issues/new";

        // @ts-ignore
        if (window.runtime) {
            // @ts-ignore
            window.runtime.BrowserOpenURL(url);
        } else {
            window.open(url, '_blank');
        }
    }

    render() {
        // CRITICAL FIX: Error Boundaries ONLY catch errors in their CHILDREN.
        // We cannot throw here directly. We must render a child that throws.
        if (this.state.shouldCrash) {
            return <CrashChild />;
        }

        if (this.state.hasError) {
            const btnStyle = {
                padding: '8px 16px',
                borderRadius: '6px',
                border: '1px solid #444',
                background: '#222',
                color: '#ddd',
                cursor: 'pointer',
                fontSize: '14px',
                marginRight: '10px',
                marginBottom: '10px'
            };

            const primaryBtnStyle = { ...btnStyle, background: '#dc2626', borderColor: '#dc2626', color: 'white' };

            return (
                <div style={{
                    position: 'fixed', inset: 0,
                    backgroundColor: '#111', color: '#eee',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'Segoe UI, system-ui, sans-serif', padding: '20px', zIndex: 99999
                }}>
                    <div style={{
                        maxWidth: '800px', width: '100%',
                        background: '#1a1a1a', borderRadius: '12px', border: '1px solid #333',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', overflow: 'hidden'
                    }}>
                        <div style={{ padding: '24px', borderBottom: '1px solid #333', background: 'rgba(220, 38, 38, 0.1)' }}>
                            <h1 style={{ margin: 0, fontSize: '24px', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <span style={{ fontSize: '28px' }}>⚠️</span> Application Error
                            </h1>
                            <p style={{ margin: '8px 0 0 0', color: '#ffaaaa', opacity: 0.9 }}>
                                YAVAM has encountered a critical error and needs to close.
                            </p>
                        </div>

                        <div style={{ padding: '24px' }}>
                            <div style={{
                                background: '#000', padding: '16px', borderRadius: '8px',
                                fontFamily: 'Consolas, monospace', fontSize: '13px', color: '#f87171',
                                overflow: 'auto', maxHeight: '300px', marginBottom: '24px', border: '1px solid #333'
                            }}>
                                <strong style={{ display: 'block', marginBottom: '8px' }}>{this.state.error?.toString()}</strong>
                                <span style={{ color: '#888' }}>{this.state.errorInfo?.componentStack}</span>
                            </div>

                            <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                                <button onClick={this.handleCopyError} style={btnStyle}>
                                    {this.state.copySuccess ? "✓ Copied" : "📋 Copy Log"}
                                </button>
                                <button onClick={this.handleReportIssue} style={btnStyle}>
                                    🐞 Report Issue
                                </button>
                                <button onClick={() => window.location.reload()} style={btnStyle}>
                                    🔄 Reload App
                                </button>
                                <div style={{ flex: 1 }}></div>

                                {/* @ts-ignore */}
                                {window.go && (
                                    <button
                                        onClick={() => {
                                            if (confirm("Are you sure? This will delete all local database files.")) {
                                                // @ts-ignore
                                                if (window.go.main && window.go.main.App && window.go.main.App.ClearAppData) {
                                                    // @ts-ignore
                                                    window.go.main.App.ClearAppData()
                                                        .then(() => {
                                                            // @ts-ignore
                                                            window.go.main.App.RestartApp();
                                                        })
                                                        .catch((err: any) => console.error("Reset failed", err));
                                                }
                                            }
                                        }}
                                        style={primaryBtnStyle}
                                    >
                                        🗑️ Factory Reset
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

import { initWailsPolyfill } from './services/wails-polyfill';

// Initialize Polyfill for Web Mode
initWailsPolyfill();

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <ErrorBoundary>
            <App />
        </ErrorBoundary>
    </React.StrictMode>,
)
