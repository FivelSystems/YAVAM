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
        console.warn(`[API] 401 Unauthorized from: ${url}`);
        // Token expired or invalid
        logout();
        // window.location.reload(); // FIXED: Do not force reload, let AuthContext handle the modal
    }

    return response;
}
