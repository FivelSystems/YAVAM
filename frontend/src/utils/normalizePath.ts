/** Comparison key for file paths: separator-insensitive and case-insensitive (Windows). */
export const normalizePath = (path: string): string => path.replace(/\\/g, '/').toLowerCase();

export const isSamePath = (a: string, b: string): boolean => normalizePath(a) === normalizePath(b);
