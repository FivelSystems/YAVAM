// Mirrors the backend rules (pkg/services/auth) so users get instant feedback; the backend stays authoritative.
export const MIN_PASSWORD_LENGTH = 8;
export const DEFAULT_PASSWORD = 'admin';

export const PASSWORD_TOO_SHORT_MESSAGE = `The password must be at least ${MIN_PASSWORD_LENGTH} characters long.`;
export const PASSWORD_IS_DEFAULT_MESSAGE = 'Choose a password other than the default one.';

export function validateAdminPassword(password: string): string | null {
    if (password === DEFAULT_PASSWORD) return PASSWORD_IS_DEFAULT_MESSAGE;
    if ([...password].length < MIN_PASSWORD_LENGTH) return PASSWORD_TOO_SHORT_MESSAGE;
    return null;
}

export function describeBackendError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
