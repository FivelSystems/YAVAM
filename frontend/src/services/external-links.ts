const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

const openExternally = (url: string) => {
    if (window.runtime?.BrowserOpenURL) {
        window.runtime.BrowserOpenURL(url);
    } else {
        window.open(url, '_blank', 'noopener,noreferrer');
    }
};

/**
 * In the native Wails webview a real `<a href>` navigates the webview in place —
 * there is no browser chrome, so the user cannot go back and the app is unusable
 * until the process restarts. This SPA navigates via React state, never via
 * anchors, so no anchor should ever be allowed to move the webview off the app.
 *
 * Any web link (CHANGELOG "What's New", About page, future embedded content) is
 * routed to the system browser; anything else that would navigate away is simply
 * blocked. Download anchors and in-page (`#`) anchors are left untouched.
 */
export function initExternalLinkGuard() {
    document.addEventListener(
        'click',
        (event) => {
            if (event.defaultPrevented || event.button !== 0) return;
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

            const anchor = (event.target as HTMLElement | null)?.closest('a');
            const href = anchor?.getAttribute('href');
            if (!anchor || !href) return;

            // Native downloads and in-page anchors must keep their default behaviour.
            if (anchor.hasAttribute('download')) return;
            if (href.startsWith('#')) return;

            let url: URL;
            try {
                url = new URL(href, window.location.href);
            } catch {
                event.preventDefault();
                return;
            }

            // Nothing should navigate the webview away from the app.
            event.preventDefault();
            if (EXTERNAL_PROTOCOLS.has(url.protocol)) {
                openExternally(url.href);
            }
        },
        true,
    );
}
