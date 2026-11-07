const HTTP_BAD_REQUEST = 400;
const HTTP_CONFLICT = 409;

export const HTTP_UNAUTHORIZED = 401;

export class UploadRejectedError extends Error {
    constructor(public readonly status: number, public readonly serverMessage: string) {
        super(serverMessage || `HTTP ${status}`);
        this.name = 'UploadRejectedError';
    }
}

// The server reports refusals as JSON { success: false, message }.
export async function readServerMessage(response: Response): Promise<string> {
    try {
        const body = await response.json();
        return typeof body?.message === 'string' ? body.message : '';
    } catch {
        return '';
    }
}

// Maps a failed upload to one sentence for the user; unknown refusals fall back to the server's own message.
export function describeUploadFailure(fileName: string, error: unknown): string {
    if (!(error instanceof UploadRejectedError)) {
        return `${fileName} could not be uploaded: unable to reach the server.`;
    }
    switch (error.status) {
        case HTTP_CONFLICT:
            return `${fileName} already exists in the library.`;
        case HTTP_BAD_REQUEST:
            return error.serverMessage
                ? `${fileName} was not uploaded: ${error.serverMessage}`
                : `${fileName} is not a valid package file.`;
        default:
            return `${fileName} could not be uploaded: ${error.serverMessage || `server responded with HTTP ${error.status}`}`;
    }
}
