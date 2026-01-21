import { getStoredToken, logout } from './auth';

export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
    const token = getStoredToken();
    const headers = new Headers(options.headers || {});

    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    const config: RequestInit = {
        ...options,
        headers
    };

    const response = await fetch(url, config);

    if (response.status === 401) {
        // Token expired or invalid
        logout();
        window.location.reload(); // Force reload to clear state/redirect to login
    }

    return response;
}
