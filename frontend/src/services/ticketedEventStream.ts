export const RECONNECT_MIN_DELAY_MS = 1000;
export const RECONNECT_MAX_DELAY_MS = 30000;
const RECONNECT_BACKOFF_FACTOR = 2;

const EVENTS_URL = '/api/events';
const TICKET_URL = '/api/events/ticket';
const HTTP_UNAUTHORIZED = 401;

export interface EventStreamDependencies {
    fetch: typeof fetch;
    EventSource: typeof EventSource;
    getToken: () => string | null;
    onSessionEnded: () => void;
    onMessage: (event: MessageEvent) => void;
}

type TicketResult =
    | { kind: 'ticket'; ticket: string }
    | { kind: 'session-ended' }
    | { kind: 'transient-failure' };

/**
 * Keeps one server-sent-events connection alive using a single-use ticket per
 * connection. A fresh ticket is requested before every EventSource creation,
 * because the browser's built-in reconnect would replay a spent URL.
 * Never logs or exposes the ticket or the session token.
 */
export class TicketedEventStream {
    private source: EventSource | null = null;
    private retryTimer: ReturnType<typeof setTimeout> | null = null;
    private nextDelayMs = RECONNECT_MIN_DELAY_MS;
    private running = false;
    private attempt = 0;

    constructor(private readonly deps: EventStreamDependencies) {}

    start(): void {
        if (this.running) return;
        this.running = true;
        this.nextDelayMs = RECONNECT_MIN_DELAY_MS;
        void this.connect();
    }

    stop(): void {
        this.running = false;
        this.attempt++;
        this.closeSource();
        if (this.retryTimer !== null) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
    }

    private async connect(): Promise<void> {
        const attempt = ++this.attempt;
        const token = this.deps.getToken();

        if (!token) {
            this.openSource(EVENTS_URL, attempt);
            return;
        }

        const result = await this.requestTicket(token);
        if (!this.isCurrent(attempt)) return;

        if (result.kind === 'session-ended') {
            this.stop();
            this.deps.onSessionEnded();
            return;
        }
        if (result.kind === 'transient-failure') {
            this.scheduleRetry();
            return;
        }
        this.openSource(`${EVENTS_URL}?ticket=${encodeURIComponent(result.ticket)}`, attempt);
    }

    private async requestTicket(token: string): Promise<TicketResult> {
        try {
            const response = await this.deps.fetch(TICKET_URL, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.status === HTTP_UNAUTHORIZED) return { kind: 'session-ended' };
            if (!response.ok) return { kind: 'transient-failure' };

            const body = await response.json();
            if (typeof body?.ticket !== 'string' || body.ticket === '') {
                return { kind: 'transient-failure' };
            }
            return { kind: 'ticket', ticket: body.ticket };
        } catch {
            return { kind: 'transient-failure' };
        }
    }

    private openSource(url: string, attempt: number): void {
        this.closeSource();
        const source = new this.deps.EventSource(url);
        this.source = source;

        source.onopen = () => {
            if (!this.isCurrent(attempt)) return;
            this.nextDelayMs = RECONNECT_MIN_DELAY_MS;
        };
        source.onmessage = (event) => {
            if (!this.isCurrent(attempt)) return;
            this.deps.onMessage(event);
        };
        source.onerror = () => {
            if (!this.isCurrent(attempt)) return;
            this.closeSource();
            this.scheduleRetry();
        };
    }

    private scheduleRetry(): void {
        if (!this.running || this.retryTimer !== null) return;
        const delay = this.nextDelayMs;
        this.nextDelayMs = Math.min(delay * RECONNECT_BACKOFF_FACTOR, RECONNECT_MAX_DELAY_MS);
        this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            void this.connect();
        }, delay);
    }

    private closeSource(): void {
        if (!this.source) return;
        this.source.onopen = null;
        this.source.onmessage = null;
        this.source.onerror = null;
        this.source.close();
        this.source = null;
    }

    private isCurrent(attempt: number): boolean {
        return this.running && attempt === this.attempt;
    }
}
