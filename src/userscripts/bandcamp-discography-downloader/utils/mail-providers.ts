import { requestJson, sleep } from './network.ts';

export interface MailSummary {
    id: string;
    sender: string;
    subject: string;
}

export interface MailProvider {
    readonly name: string;
    createAddress(): Promise<string>;
    listMessages(): Promise<MailSummary[]>;
    readMessage(id: string): Promise<string>;
}

export class GuerrillaMailProvider implements MailProvider {
    readonly name = 'Guerrilla Mail';
    private sessionToken: string | null = null;

    constructor(private readonly signal?: AbortSignal) {}

    private api<T>(functionName: string, parameters: Record<string, string | number> = {}): Promise<T> {
        const url = new URL('https://api.guerrillamail.com/ajax.php');
        url.searchParams.set('f', functionName);
        url.searchParams.set('ip', '127.0.0.1');
        url.searchParams.set('agent', navigator.userAgent.slice(0, 160));
        if (this.sessionToken) {
            url.searchParams.set('sid_token', this.sessionToken);
        }
        for (const [key, value] of Object.entries(parameters)) {
            url.searchParams.set(key, String(value));
        }
        return requestJson<T>(url.href, this.signal ? { signal: this.signal } : {});
    }

    async createAddress(): Promise<string> {
        const response = await this.api<{ email_addr?: string; sid_token?: string }>('get_email_address', {
            lang: 'en',
        });
        if (!response.email_addr || !response.sid_token) {
            throw new Error('Guerrilla Mail did not return a temporary address and session token');
        }
        this.sessionToken = response.sid_token;
        return response.email_addr;
    }

    async listMessages(): Promise<MailSummary[]> {
        const response = await this.api<{
            list?: { mail_id?: string | number; mail_from?: string; mail_subject?: string }[];
        }>('check_email', { seq: 0 });
        if (!Array.isArray(response.list)) {
            throw new Error('Guerrilla Mail returned an invalid message list');
        }
        return response.list.map(message => ({
            id: message.mail_id === undefined ? '' : String(message.mail_id),
            sender: message.mail_from ?? '',
            subject: message.mail_subject ?? '',
        }));
    }

    async readMessage(id: string): Promise<string> {
        const response = await this.api<{ mail_body?: string }>('fetch_email', { email_id: id });
        if (typeof response.mail_body !== 'string') {
            throw new Error('Guerrilla Mail returned an invalid message body');
        }
        return response.mail_body;
    }
}

interface MailTmCollection<T> {
    'hydra:member'?: T[];
    'hydra:view'?: { 'hydra:next'?: string };
}

/** https://docs.mail.tm/ — no API key; credentials exist only for this download queue. */
export class MailTmProvider implements MailProvider {
    readonly name = 'Mail.tm';
    private token: string | null = null;
    private nextRequestAt = 0;

    constructor(private readonly signal?: AbortSignal) {}

    private async api<T>(path: string, data?: { address: string; password: string }): Promise<T> {
        // Stay below Mail.tm's 8 requests/second per-IP limit, including message reads.
        const delay = this.nextRequestAt - Date.now();
        if (delay > 0) {
            await sleep(delay, this.signal);
        }
        this.nextRequestAt = Date.now() + 200;
        return requestJson<T>(`https://api.mail.tm${path}`, {
            headers: {
                Accept: 'application/ld+json',
                ...(data ? { 'Content-Type': 'application/json' } : {}),
                ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
            },
            ...(data ? { method: 'POST', data: JSON.stringify(data) } : {}),
            ...(this.signal ? { signal: this.signal } : {}),
        });
    }

    async createAddress(): Promise<string> {
        const response =
            await this.api<MailTmCollection<{ domain: string; isActive: boolean; isPrivate: boolean }>>('/domains');
        const domain = response['hydra:member']?.find(domain => domain.isActive && !domain.isPrivate)?.domain;
        if (!domain) {
            throw new Error('Mail.tm did not return an active public domain');
        }
        const credentials = {
            address: `bc${crypto.randomUUID().replaceAll('-', '')}@${domain}`,
            password: crypto.randomUUID(),
        };
        const account = await this.api<{ address?: string }>('/accounts', credentials);
        if (account.address !== credentials.address) {
            throw new Error('Mail.tm did not return the requested temporary address');
        }
        const auth = await this.api<{ token?: string }>('/token', credentials);
        if (!auth.token) {
            throw new Error('Mail.tm did not return an authentication token');
        }
        this.token = auth.token;
        return credentials.address;
    }

    async listMessages(): Promise<MailSummary[]> {
        const messages: MailSummary[] = [];
        let path: string | undefined = '/messages';
        const visited = new Set<string>();
        while (path && !visited.has(path)) {
            visited.add(path);
            const response: MailTmCollection<{ id: string; from: { address: string }; subject: string }> =
                await this.api(path);
            if (!Array.isArray(response['hydra:member'])) {
                throw new Error('Mail.tm returned an invalid message list');
            }
            messages.push(
                ...response['hydra:member'].map(message => ({
                    id: message.id,
                    sender: message.from.address,
                    subject: message.subject,
                })),
            );
            const next = response['hydra:view']?.['hydra:next'];
            if (next && !next.startsWith('/messages?')) {
                throw new Error('Mail.tm returned an invalid message page');
            }
            path = next;
        }
        return messages;
    }

    async readMessage(id: string): Promise<string> {
        const response = await this.api<{ html?: string[]; text?: string }>(`/messages/${encodeURIComponent(id)}`);
        if (!Array.isArray(response.html) && typeof response.text !== 'string') {
            throw new Error('Mail.tm returned an invalid message body');
        }
        return [...(response.html ?? []), response.text ?? ''].join('\n');
    }
}
