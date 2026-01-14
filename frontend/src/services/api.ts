import { getStoredToken } from './auth';

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

    return fetch(url, config);
}
