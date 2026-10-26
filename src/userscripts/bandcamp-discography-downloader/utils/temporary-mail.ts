import { fetchCookedDownload } from './bandcamp.ts';
import { GuerrillaMailProvider, MailTmProvider, type MailProvider } from './mail-providers.ts';
import { abortError, formEncode, requestJson, sleep } from './network.ts';
import type { CookedDownload, ReleaseInfo } from './types.ts';

const POLL_INTERVAL_MS = 5_000;
const EMAIL_TIMEOUT_MS = 180_000;

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

class ProviderInbox {
    private addressPromise: Promise<string> | null = null;
    private readonly downloads = new Map<string, CookedDownload>();
    private nextPollAt = 0;
    private pollPromise: Promise<void> | null = null;
    private readonly seenMessages = new Set<string>();
    constructor(
        private readonly provider: MailProvider,
        private readonly signal?: AbortSignal,
    ) {}

    private async mailboxRequest<T>(operation: () => Promise<T>): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            if (this.signal?.aborted) {
                throw abortError(this.signal);
            }
            throw new MailboxError(`${this.provider.name}: ${error instanceof Error ? error.message : String(error)}`, {
                cause: error,
            });
        }
    }

    private getAddress(): Promise<string> {
        this.addressPromise ??= this.mailboxRequest(() => this.provider.createAddress());
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
            throw new MailboxError(`Bandcamp rejected the ${this.provider.name} temporary email address`);
        }
    }

    private async doPoll(): Promise<void> {
        const delay = this.nextPollAt - Date.now();
        if (delay > 0) {
            await sleep(delay, this.signal);
        }
        this.nextPollAt = Date.now() + POLL_INTERVAL_MS;

        const messages = await this.mailboxRequest(() => this.provider.listMessages());
        for (const message of messages) {
            const id = message.id;
            if (!id || this.seenMessages.has(id)) {
                continue;
            }
            const sender = decodeHtmlText(message.sender).toLowerCase();
            const subject = decodeHtmlText(message.subject).toLowerCase();
            if (!sender.includes('noreply@bandcamp.com') || !subject.includes('download')) {
                this.seenMessages.add(id);
                continue;
            }

            const body = await this.mailboxRequest(() => this.provider.readMessage(id));
            const links = downloadLinks(body);
            let resolvedLink = false;
            for (const url of links) {
                try {
                    const download = await fetchCookedDownload(url, this.signal);
                    this.downloads.set(releaseKey(download.itemType, download.itemId), download);
                    resolvedLink = true;
                } catch (error) {
                    if (this.signal?.aborted) {
                        throw abortError(this.signal);
                    }
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
        while (Date.now() < deadline) {
            if (this.signal?.aborted) {
                throw abortError(this.signal);
            }
            const available = this.downloads.get(key);
            if (available) {
                this.downloads.delete(key);
                return available;
            }
            await this.poll();
        }
        throw new MailboxError(`Timed out waiting for the Bandcamp download email via ${this.provider.name}`);
    }
}

class MailboxError extends Error {}

/** Provider sessions and polls are shared by all concurrent releases in one queue. */
export class TemporaryInbox {
    private readonly providers: { inbox: ProviderInbox; name: string; failure?: MailboxError }[];

    constructor(private readonly signal?: AbortSignal) {
        this.providers = [new GuerrillaMailProvider(signal), new MailTmProvider(signal)].map(provider => ({
            inbox: new ProviderInbox(provider, signal),
            name: provider.name,
        }));
    }

    async resolveDownload(release: ReleaseInfo, report: (message: string) => void): Promise<CookedDownload> {
        if (this.signal?.aborted) {
            throw abortError(this.signal);
        }
        for (const provider of this.providers) {
            if (provider.failure) {
                continue;
            }
            try {
                report(`Requesting download email via ${provider.name}`);
                await provider.inbox.requestDownloadEmail(release);
                report(`Waiting for Bandcamp email via ${provider.name}`);
                return await provider.inbox.waitForDownload(release);
            } catch (error) {
                if (this.signal?.aborted) {
                    throw abortError(this.signal);
                }
                // Bandcamp HTTP failures are not mailbox outages: keep their original error.
                if (!(error instanceof MailboxError)) {
                    throw error;
                }
                provider.failure = error;
                console.warn(
                    `[Bandcamp Collection Downloader] ${provider.name} failed; trying next mail provider`,
                    error,
                );
            }
        }
        throw new AggregateError(
            this.providers.map(provider => provider.failure),
            `All temporary mail providers failed: ${this.providers.map(provider => provider.failure?.message).join('; ')}`,
        );
    }
}
