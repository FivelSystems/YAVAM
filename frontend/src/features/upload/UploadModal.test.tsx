import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { UploadModal } from './UploadModal';
import { ToastProvider } from '../../context/ToastContext';
import { ToastContainer } from '../layout/ToastContainer';
import { stubMemoryLocalStorage } from '../../test/memoryStorage';

const LIBRARY = '/library/main';
const PLENTY_OF_SPACE = { free: 1_000_000_000, total: 2_000_000_000 };
const noop = () => { };

function jsonResponse(status: number, body: unknown) {
    return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

function renderModal(files: File[]) {
    const initialFiles = files;
    return render(
        <ToastProvider>
            <UploadModal
                isOpen
                onClose={noop}
                initialFiles={initialFiles}
                onAppendFiles={noop}
                libraries={[LIBRARY]}
                initialLibrary={LIBRARY}
                onSuccess={noop}
            />
            <ToastContainer />
        </ToastProvider>
    );
}

async function startUpload(fileCount: number) {
    const installButton = await screen.findByRole('button', { name: `Install ${fileCount} Packages` });
    await waitFor(() => expect(installButton).toBeEnabled());
    fireEvent.click(installButton);
}

describe('UploadModal rejection feedback (web mode)', () => {
    let uploadResponses: ReturnType<typeof jsonResponse>[];
    const fetchMock = vi.fn();

    beforeEach(() => {
        stubMemoryLocalStorage();
        uploadResponses = [];
        fetchMock.mockReset();
        fetchMock.mockImplementation(async (url: string) => {
            if (url.startsWith('/api/disk-space')) return jsonResponse(200, PLENTY_OF_SPACE);
            if (url === '/api/scan/collisions') return jsonResponse(200, { collisions: [] });
            if (url === '/api/upload') return uploadResponses.shift();
            throw new Error(`unexpected request ${url}`);
        });
        vi.stubGlobal('fetch', fetchMock);
        vi.spyOn(console, 'error').mockImplementation(() => { });
        vi.spyOn(console, 'log').mockImplementation(() => { });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('tells the user a duplicate already exists in the library', async () => {
        uploadResponses.push(jsonResponse(409, { success: false, message: 'Package already exists in library: dup.var' }));
        renderModal([new File(['x'], 'dup.var')]);

        await startUpload(1);

        expect(await screen.findAllByText('dup.var already exists in the library.')).not.toHaveLength(0);
    });

    it('shows the server reason when the file name is refused', async () => {
        uploadResponses.push(jsonResponse(400, { success: false, message: 'Package file name contains characters or names that are not allowed' }));
        renderModal([new File(['x'], 'odd.var')]);

        await startUpload(1);

        expect(await screen.findAllByText('odd.var was not uploaded: Package file name contains characters or names that are not allowed')).not.toHaveLength(0);
    });

    it('says nothing was uploaded when every file in the batch is refused', async () => {
        uploadResponses.push(
            jsonResponse(409, { success: false, message: 'exists' }),
            jsonResponse(409, { success: false, message: 'exists' }),
        );
        renderModal([new File(['a'], 'one.var'), new File(['bb'], 'two.var')]);

        await startUpload(2);

        expect(await screen.findByText('None of the files were uploaded.')).toBeInTheDocument();
        expect(fetchMock.mock.calls.filter(([url]) => url === '/api/upload')).toHaveLength(2);
    });

    it('falls back to the server message for other refusals', async () => {
        uploadResponses.push(jsonResponse(413, { success: false, message: 'Upload exceeds the maximum request size' }));
        renderModal([new File(['x'], 'big.var')]);

        await startUpload(1);

        expect(await screen.findAllByText('big.var could not be uploaded: Upload exceeds the maximum request size')).not.toHaveLength(0);
    });
});
