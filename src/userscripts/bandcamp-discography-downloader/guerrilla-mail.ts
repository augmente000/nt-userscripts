import { fetchCookedDownload } from './bandcamp.ts';
import { abortError, formEncode, requestJson, sleep } from './network.ts';
import type { CookedDownload, ReleaseInfo } from './types.ts';

const API_URL = 'https://api.guerrillamail.com/ajax.php';
const POLL_INTERVAL_MS = 5_000;
const EMAIL_TIMEOUT_MS = 180_000;

interface AddressResponse {
    email_addr?: string;
    sid_token?: string;
}

interface EmailSummary {
    mail_from?: string;
    mail_id?: string | number;
    mail_subject?: string;
}

interface EmailListResponse {
    list?: EmailSummary[];
}

interface EmailResponse {
    mail_body?: string;
}

interface EmailDownloadResponse {
    ok?: boolean;
}

function releaseKey(type: string, id: number): string {
    return `${type}:${id}`;
}

function decodeHtmlText(value: string): string {
    const element = document.createElement('textarea');
    element.innerHTML = value;
    return element.value;
}

function downloadLinks(body: string): string[] {
    const parsed = new DOMParser().parseFromString(body, 'text/html');
    const links = [...parsed.querySelectorAll<HTMLAnchorElement>('a[href]')]
        .map(anchor => anchor.href)
        .filter(url => {
            try {
                const parsedUrl = new URL(url);
                return (
                    (parsedUrl.hostname === 'bandcamp.com' || parsedUrl.hostname.endsWith('.bandcamp.com')) &&
                    parsedUrl.pathname === '/download'
                );
            } catch {
                return false;
            }
        });
    if (links.length > 0) {
        return [...new Set(links)];
    }

    const decoded = decodeHtmlText(body);
    return [...new Set(decoded.match(/https?:\/\/(?:[^\s"'<>]+\.)?bandcamp\.com\/download\?[^\s"'<>]+/gi) ?? [])];
}

export class GuerrillaInbox {
    private addressPromise: Promise<string> | null = null;
    private readonly downloads = new Map<string, CookedDownload>();
    private nextPollAt = 0;
    private pollPromise: Promise<void> | null = null;
    private readonly seenMessages = new Set<string>();
    private sessionToken: string | null = null;

    constructor(private readonly signal?: AbortSignal) {}

    private api<T>(functionName: string, parameters: Record<string, string | number> = {}): Promise<T> {
        const url = new URL(API_URL);
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

    private getAddress(): Promise<string> {
        this.addressPromise ??= this.api<AddressResponse>('get_email_address', { lang: 'en' }).then(response => {
            if (!response.email_addr) {
                throw new Error('Guerrilla Mail did not return a temporary address');
            }
            this.sessionToken = response.sid_token ?? null;
            return response.email_addr;
        });
        return this.addressPromise;
    }

    async requestDownloadEmail(release: ReleaseInfo): Promise<void> {
        const address = await this.getAddress();
        const response = await requestJson<EmailDownloadResponse>(new URL('/email_download', release.url).href, {
            data: formEncode({
                address,
                country: 'United States',
                encoding_name: 'none',
                item_id: release.tralbum.current.id,
                item_type: release.tralbum.current.type,
                postcode: '00000',
            }),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            method: 'POST',
            ...(this.signal ? { signal: this.signal } : {}),
        });
        if (response.ok !== true) {
            throw new Error('Bandcamp rejected the temporary email address');
        }
    }

    private async doPoll(): Promise<void> {
        const delay = this.nextPollAt - Date.now();
        if (delay > 0) {
            await sleep(delay, this.signal);
        }
        this.nextPollAt = Date.now() + POLL_INTERVAL_MS;

        const response = await this.api<EmailListResponse>('check_email', { seq: 0 });
        for (const message of response.list ?? []) {
            const id = message.mail_id === undefined ? null : String(message.mail_id);
            if (!id || this.seenMessages.has(id)) {
                continue;
            }
            const sender = decodeHtmlText(message.mail_from ?? '').toLowerCase();
            const subject = decodeHtmlText(message.mail_subject ?? '').toLowerCase();
            if (!sender.includes('noreply@bandcamp.com') || !subject.includes('download')) {
                this.seenMessages.add(id);
                continue;
            }

            const email = await this.api<EmailResponse>('fetch_email', { email_id: id });
            const links = downloadLinks(email.mail_body ?? '');
            let resolvedLink = false;
            for (const url of links) {
                try {
                    const download = await fetchCookedDownload(url, this.signal);
                    this.downloads.set(releaseKey(download.itemType, download.itemId), download);
                    resolvedLink = true;
                } catch (error) {
                    console.warn('[Bandcamp Collection Downloader] Ignoring unusable email link', error);
                }
            }
            if (links.length === 0 || resolvedLink) {
                this.seenMessages.add(id);
            }
        }
    }

    private poll(): Promise<void> {
        if (!this.pollPromise) {
            this.pollPromise = this.doPoll().finally(() => {
                this.pollPromise = null;
            });
        }
        return this.pollPromise;
    }

    async waitForDownload(release: ReleaseInfo): Promise<CookedDownload> {
        const key = releaseKey(release.tralbum.current.type, release.tralbum.current.id);
        const deadline = Date.now() + EMAIL_TIMEOUT_MS;
        let lastPollError: unknown = null;
        while (Date.now() < deadline) {
            if (this.signal?.aborted) {
                throw abortError(this.signal);
            }
            const available = this.downloads.get(key);
            if (available) {
                this.downloads.delete(key);
                return available;
            }
            try {
                await this.poll();
                lastPollError = null;
            } catch (error) {
                lastPollError = error;
                console.warn('[Bandcamp Collection Downloader] Email poll failed; retrying', error);
            }
        }
        if (lastPollError instanceof Error) {
            throw new Error(`Timed out waiting for the Bandcamp download email: ${lastPollError.message}`);
        }
        throw new Error('Timed out waiting for the Bandcamp download email');
    }
}
