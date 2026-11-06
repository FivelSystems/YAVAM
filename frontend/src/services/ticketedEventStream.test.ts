import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import {
    TicketedEventStream,
    RECONNECT_MIN_DELAY_MS,
    RECONNECT_MAX_DELAY_MS,
} from './ticketedEventStream';

class FakeEventSource {
    static instances: FakeEventSource[] = [];
    onopen: (() => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: (() => void) | null = null;
    closed = false;
    constructor(public url: string) {
        FakeEventSource.instances.push(this);
    }
    close() {
        this.closed = true;
    }
}

const ticketResponse = (ticket: string) =>
    ({ ok: true, status: 200, json: async () => ({ ticket }) }) as Response;
const statusResponse = (status: number) =>
    ({ ok: false, status, json: async () => ({}) }) as Response;

describe('TicketedEventStream', () => {
    let fetchMock: ReturnType<typeof vi.fn>;
    let onSessionEnded: Mock<() => void>;
    let onMessage: Mock<(event: MessageEvent) => void>;
    let stream: TicketedEventStream;

    const flush = () => vi.advanceTimersByTimeAsync(0);
    const lastSource = () => FakeEventSource.instances[FakeEventSource.instances.length - 1];

    beforeEach(() => {
        vi.useFakeTimers();
        FakeEventSource.instances = [];
        fetchMock = vi.fn();
        onSessionEnded = vi.fn();
        onMessage = vi.fn();
        stream = new TicketedEventStream({
            fetch: fetchMock as unknown as typeof fetch,
            EventSource: FakeEventSource as unknown as typeof EventSource,
            getToken: () => 'session-token-placeholder',
            onSessionEnded,
            onMessage,
        });
    });

    afterEach(() => {
        stream.stop();
        vi.useRealTimers();
    });

    it('fetches a ticket with bearer auth before opening the stream', async () => {
        fetchMock.mockResolvedValue(ticketResponse('ticket-1'));
        stream.start();
        await flush();

        expect(fetchMock).toHaveBeenCalledWith('/api/events/ticket', {
            method: 'POST',
            headers: { Authorization: 'Bearer session-token-placeholder' },
        });
        expect(FakeEventSource.instances).toHaveLength(1);
        expect(lastSource().url).toBe('/api/events?ticket=ticket-1');
        expect(lastSource().url).not.toContain('token=');
    });

    it('does not start a second loop when start is called twice', async () => {
        fetchMock.mockResolvedValue(ticketResponse('ticket-1'));
        stream.start();
        stream.start();
        await flush();

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(FakeEventSource.instances).toHaveLength(1);
    });

    it('fetches a new ticket for every reconnect', async () => {
        fetchMock
            .mockResolvedValueOnce(ticketResponse('ticket-1'))
            .mockResolvedValueOnce(ticketResponse('ticket-2'));
        stream.start();
        await flush();
        const first = lastSource();

        first.onerror?.();
        expect(first.closed).toBe(true);
        await vi.advanceTimersByTimeAsync(RECONNECT_MIN_DELAY_MS);

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(FakeEventSource.instances).toHaveLength(2);
        expect(lastSource().url).toBe('/api/events?ticket=ticket-2');
    });

    it('grows the backoff delay up to the maximum and resets after a successful open', async () => {
        fetchMock.mockImplementation(async () => ticketResponse('t'));
        stream.start();
        await flush();

        let expectedDelay = RECONNECT_MIN_DELAY_MS;
        for (let i = 0; i < 8; i++) {
            const countBefore = FakeEventSource.instances.length;
            lastSource().onerror?.();
            await vi.advanceTimersByTimeAsync(expectedDelay - 1);
            expect(FakeEventSource.instances).toHaveLength(countBefore);
            await vi.advanceTimersByTimeAsync(1);
            expect(FakeEventSource.instances).toHaveLength(countBefore + 1);
            expectedDelay = Math.min(expectedDelay * 2, RECONNECT_MAX_DELAY_MS);
        }
        expect(expectedDelay).toBe(RECONNECT_MAX_DELAY_MS);

        lastSource().onopen?.();
        const countBefore = FakeEventSource.instances.length;
        lastSource().onerror?.();
        await vi.advanceTimersByTimeAsync(RECONNECT_MIN_DELAY_MS);
        expect(FakeEventSource.instances).toHaveLength(countBefore + 1);
    });

    it('retries with backoff on transient ticket failures', async () => {
        fetchMock
            .mockResolvedValueOnce(statusResponse(429))
            .mockResolvedValueOnce(ticketResponse('ticket-2'));
        stream.start();
        await flush();
        expect(FakeEventSource.instances).toHaveLength(0);

        await vi.advanceTimersByTimeAsync(RECONNECT_MIN_DELAY_MS);
        expect(lastSource().url).toBe('/api/events?ticket=ticket-2');
        expect(onSessionEnded).not.toHaveBeenCalled();
    });

    it('stops the loop and signals session end on a 401 ticket response', async () => {
        fetchMock.mockResolvedValue(statusResponse(401));
        stream.start();
        await flush();

        expect(onSessionEnded).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(RECONNECT_MAX_DELAY_MS * 2);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(FakeEventSource.instances).toHaveLength(0);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('stop closes the source and cancels the pending retry', async () => {
        fetchMock.mockResolvedValue(ticketResponse('ticket-1'));
        stream.start();
        await flush();
        const source = lastSource();

        source.onerror?.();
        expect(vi.getTimerCount()).toBe(1);
        stream.stop();
        expect(vi.getTimerCount()).toBe(0);

        await vi.advanceTimersByTimeAsync(RECONNECT_MAX_DELAY_MS);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        stream.start();
        await flush();
        lastSource().onmessage?.({ data: '{}' } as MessageEvent);
        stream.stop();
        expect(lastSource().closed).toBe(true);
    });

    it('ignores a ticket response that arrives after stop', async () => {
        let resolveTicket: (value: Response) => void = () => {};
        fetchMock.mockReturnValue(new Promise<Response>((resolve) => (resolveTicket = resolve)));
        stream.start();
        stream.stop();
        resolveTicket(ticketResponse('late'));
        await flush();

        expect(FakeEventSource.instances).toHaveLength(0);
    });

    it('forwards messages to the handler', async () => {
        fetchMock.mockResolvedValue(ticketResponse('ticket-1'));
        stream.start();
        await flush();
        const event = { data: '{"event":"x"}' } as MessageEvent;
        lastSource().onmessage?.(event);

        expect(onMessage).toHaveBeenCalledWith(event);
    });
});
