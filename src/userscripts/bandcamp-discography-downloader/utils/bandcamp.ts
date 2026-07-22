import { requestJson, requestText } from './network.ts';
import type { CookedDownload, ReleaseInfo, ReleaseTask, ReleaseType, TralbumData } from './types.ts';

interface CollectionSearchResponse {
    redownload_urls?: Record<string, string>;
    tralbums?: Array<{
        sale_item_id?: number;
        sale_item_type?: string;
        tralbum_id?: number;
        tralbum_type?: string;
    }>;
}

interface ClientGridItem {
    filtered?: boolean;
    page_url?: string;
    title?: string;
    type?: string;
}

interface DownloadBlob {
    digital_items?: Array<{
        downloads?: Record<string, { url?: string }>;
        item_id?: number | string;
        type?: string;
    }>;
}

export type PageKind = 'discography' | 'release' | 'unsupported';

export function detectPage(location: Location = window.location): PageKind {
    const path = location.pathname.replace(/\/+$/, '') || '/';
    const host = location.hostname.toLowerCase();
    const isArtistSubdomain = host.endsWith('.bandcamp.com') && host !== 'www.bandcamp.com';
    if (path === '/music' || (path === '/' && isArtistSubdomain)) {
        return 'discography';
    }
    if (/^\/(album|track)\/[^/]+$/.test(path)) {
        return 'release';
    }
    return 'unsupported';
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function parseJson(value: string, description: string): unknown {
    try {
        return JSON.parse(value) as unknown;
    } catch {
        throw new Error(`Could not parse ${description}`);
    }
}

function normalizeReleaseUrl(url: string, baseUrl: string): string {
    return new URL(url, baseUrl).href;
}

function visibleGridItem(element: HTMLElement): boolean {
    if (element.hidden || element.style.display === 'none') {
        return false;
    }
    return !element.getAttribute('style')?.replace(/\s/g, '').includes('display:none');
}

export function discoverReleases(document: Document, pageUrl: string): ReleaseTask[] {
    const releases = new Map<string, ReleaseTask>();
    const grid = document.querySelector<HTMLElement>('ol#music-grid');
    if (!grid) {
        return [];
    }

    for (const item of grid.querySelectorAll<HTMLElement>('li')) {
        if (!visibleGridItem(item)) {
            continue;
        }

        const anchor = item.querySelector<HTMLAnchorElement>('a[href*="/album/"], a[href*="/track/"]');
        if (!anchor) {
            continue;
        }

        const url = normalizeReleaseUrl(anchor.getAttribute('href') ?? anchor.href, pageUrl);
        const title =
            item.querySelector<HTMLElement>('.title')?.textContent?.trim() ||
            anchor.getAttribute('title')?.trim() ||
            anchor.textContent?.trim() ||
            'Untitled release';
        releases.set(url, { title, url });
    }

    const clientItems = grid.dataset['clientItems'];
    if (clientItems) {
        const parsed = parseJson(clientItems, 'discography client items');
        if (Array.isArray(parsed)) {
            for (const candidate of parsed) {
                if (!isRecord(candidate)) {
                    continue;
                }
                const item = candidate as ClientGridItem;
                if (
                    item.filtered ||
                    typeof item.page_url !== 'string' ||
                    (item.type !== 'album' && item.type !== 'track')
                ) {
                    continue;
                }

                const url = normalizeReleaseUrl(item.page_url, pageUrl);
                releases.set(url, {
                    title: typeof item.title === 'string' ? item.title : 'Untitled release',
                    url,
                });
            }
        }
    }

    return [...releases.values()];
}

function releaseType(value: unknown): ReleaseType | null {
    return value === 'album' || value === 'track' ? value : null;
}

function parseTralbum(document: Document): TralbumData {
    const element = document.querySelector<HTMLScriptElement>('script[data-tralbum]');
    const value = element?.getAttribute('data-tralbum');
    if (!value) {
        throw new Error('This page has no Bandcamp release data');
    }

    const parsed = parseJson(value, 'Bandcamp release data');
    if (!isRecord(parsed) || !isRecord(parsed['current'])) {
        throw new Error('Bandcamp returned malformed release data');
    }

    const current = parsed['current'];
    const type = releaseType(current['type']);
    const currentId = Number(current['id']);
    const id = Number(parsed['id']);
    if (!type || !Number.isInteger(currentId) || currentId <= 0 || !Number.isInteger(id) || id <= 0) {
        throw new Error('Bandcamp release data is missing an item identifier');
    }

    return {
        current: {
            id: currentId,
            title: typeof current['title'] === 'string' ? current['title'] : 'Untitled release',
            type,
        },
        freeDownloadPage:
            typeof parsed['freeDownloadPage'] === 'string' && parsed['freeDownloadPage']
                ? parsed['freeDownloadPage']
                : null,
        hasAudio: parsed['hasAudio'] === true,
        id,
        is_purchased: parsed['is_purchased'] === true,
        item_type: typeof parsed['item_type'] === 'string' ? parsed['item_type'] : type,
        url: typeof parsed['url'] === 'string' ? parsed['url'] : window.location.href,
        ...(typeof parsed['art_id'] === 'number' ? { art_id: parsed['art_id'] } : {}),
    };
}

function jsonLdDocuments(document: Document): unknown[] {
    const values: unknown[] = [];
    for (const script of document.querySelectorAll<HTMLScriptElement>('head > script[type="application/ld+json"]')) {
        if (!script.textContent?.trim()) {
            continue;
        }
        try {
            values.push(JSON.parse(script.textContent) as unknown);
        } catch {
            // Other JSON-LD blocks are not required for download resolution.
        }
    }
    return values;
}

function numericOfferPrice(value: unknown): number | null {
    if (!isRecord(value)) {
        return null;
    }
    const offers = value['offers'];
    const candidates = Array.isArray(offers) ? offers : [offers];
    for (const offer of candidates) {
        if (!isRecord(offer)) {
            continue;
        }
        const rawPrice = offer['price'];
        if (typeof rawPrice !== 'number' && (typeof rawPrice !== 'string' || rawPrice.trim() === '')) {
            continue;
        }
        const price = Number(rawPrice);
        if (Number.isFinite(price)) {
            return price;
        }
    }
    return null;
}

function releaseOfferPrice(jsonLd: unknown): number | null {
    if (Array.isArray(jsonLd)) {
        for (const item of jsonLd) {
            const price = releaseOfferPrice(item);
            if (price !== null) {
                return price;
            }
        }
        return null;
    }
    if (!isRecord(jsonLd)) {
        return null;
    }

    const headId = typeof jsonLd['@id'] === 'string' ? jsonLd['@id'] : null;
    const container = isRecord(jsonLd['inAlbum']) ? jsonLd['inAlbum'] : jsonLd;
    const releases = Array.isArray(container['albumRelease']) ? container['albumRelease'] : [container['albumRelease']];
    const matching = releases.find(candidate => isRecord(candidate) && headId !== null && candidate['@id'] === headId);
    const exactPrice = numericOfferPrice(matching);
    if (exactPrice !== null) {
        return exactPrice;
    }

    return numericOfferPrice(jsonLd);
}

function artistName(jsonLd: unknown): string | null {
    if (Array.isArray(jsonLd)) {
        for (const item of jsonLd) {
            const artist = artistName(item);
            if (artist) {
                return artist;
            }
        }
        return null;
    }
    if (!isRecord(jsonLd)) {
        return null;
    }
    const artist = jsonLd['byArtist'];
    if (isRecord(artist) && typeof artist['name'] === 'string') {
        return artist['name'];
    }
    return null;
}

function originalArtworkUrl(url: string, baseUrl: string): string {
    const parsed = new URL(url, baseUrl);
    if (
        (parsed.hostname === 'bcbits.com' || parsed.hostname.endsWith('.bcbits.com')) &&
        /\/a\d+_\d+\.[a-z0-9]+$/i.test(parsed.pathname)
    ) {
        parsed.pathname = parsed.pathname.replace(/_\d+(?=\.[a-z0-9]+$)/i, '_0');
    }
    return parsed.href;
}

function artworkUrl(document: Document, tralbum: TralbumData, jsonLd: unknown[]): string | null {
    for (const data of jsonLd) {
        if (isRecord(data)) {
            const image = data['image'];
            if (typeof image === 'string') {
                return originalArtworkUrl(image, tralbum.url);
            }
            if (isRecord(image) && typeof image['url'] === 'string') {
                return originalArtworkUrl(image['url'], tralbum.url);
            }
            if (Array.isArray(image)) {
                const candidate = image.find(value => typeof value === 'string');
                if (typeof candidate === 'string') {
                    return originalArtworkUrl(candidate, tralbum.url);
                }
            }
        }
    }

    const socialImage = document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content;
    if (socialImage) {
        return originalArtworkUrl(socialImage, tralbum.url);
    }
    return tralbum.art_id ? `https://f4.bcbits.com/img/a${tralbum.art_id}_0.jpg` : null;
}

function fanId(document: Document): number | null {
    const raw = document
        .querySelector<HTMLScriptElement>('script[data-tralbum-collect-info]')
        ?.getAttribute('data-tralbum-collect-info');
    if (!raw) {
        return null;
    }
    const parsed = parseJson(raw, 'Bandcamp collection data');
    if (!isRecord(parsed)) {
        return null;
    }
    const id = Number(parsed['fan_id']);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function paymentDownloadPage(document: Document, pageUrl: string): string | null {
    const raw = document.querySelector<HTMLElement>('[data-payment]')?.dataset['payment'];
    if (!raw) {
        return null;
    }
    const parsed = parseJson(raw, 'Bandcamp payment data');
    if (!isRecord(parsed) || typeof parsed['paymentDownloadPage'] !== 'string' || !parsed['paymentDownloadPage']) {
        return null;
    }
    return normalizeReleaseUrl(parsed['paymentDownloadPage'], pageUrl);
}

export function parseReleaseDocument(document: Document, pageUrl: string): ReleaseInfo {
    const tralbum = parseTralbum(document);
    const jsonLd = jsonLdDocuments(document);
    return {
        artworkUrl: artworkUrl(document, tralbum, jsonLd),
        artist:
            jsonLd.map(artistName).find((value): value is string => Boolean(value)) ??
            document.querySelector<HTMLMetaElement>('meta[property="og:site_name"]')?.content ??
            new URL(pageUrl).hostname.split('.')[0] ??
            'Bandcamp',
        document,
        fanId: fanId(document),
        isFree: jsonLd.some(data => releaseOfferPrice(data) === 0),
        paymentDownloadPage: paymentDownloadPage(document, pageUrl),
        title: tralbum.current.title,
        tralbum,
        url: pageUrl,
    };
}

export async function fetchRelease(url: string, signal?: AbortSignal): Promise<ReleaseInfo> {
    const html = await requestText(url, signal ? { signal } : {});
    const document = new DOMParser().parseFromString(html, 'text/html');
    return parseReleaseDocument(document, url);
}

function normalizeCookedUrl(url: string, baseUrl = 'https://bandcamp.com/'): string {
    return new URL(url, baseUrl).href;
}

export function parseCookedDownloadPage(html: string): CookedDownload {
    const document = new DOMParser().parseFromString(html, 'text/html');
    const blob = document.querySelector<HTMLElement>('#pagedata[data-blob]')?.dataset['blob'];
    if (!blob) {
        throw new Error('Bandcamp download page contains no download data');
    }
    const parsed = parseJson(blob, 'Bandcamp download data') as DownloadBlob;
    const item = parsed.digital_items?.[0];
    const flacUrl = item?.downloads?.['flac']?.url;
    const itemId = Number(item?.item_id);
    const itemType = releaseType(item?.type);
    if (!flacUrl || !Number.isInteger(itemId) || itemId <= 0 || !itemType) {
        throw new Error('Zipped FLAC is unavailable for this release');
    }
    return { flacUrl: normalizeCookedUrl(flacUrl), itemId, itemType };
}

export async function fetchCookedDownload(url: string, signal?: AbortSignal): Promise<CookedDownload> {
    return parseCookedDownloadPage(await requestText(normalizeCookedUrl(url), signal ? { signal } : {}));
}

export async function resolvePurchasedDownload(release: ReleaseInfo, signal?: AbortSignal): Promise<string> {
    if (release.fanId === null) {
        throw new Error('Bandcamp did not expose the logged-in fan ID');
    }

    const response = await requestJson<CollectionSearchResponse>(
        'https://bandcamp.com/api/fancollection/1/search_items',
        {
            data: JSON.stringify({
                fan_id: release.fanId,
                search_key: release.tralbum.current.title,
                search_type: 'collection',
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
            ...(signal ? { signal } : {}),
        },
    );
    const wantedType = release.tralbum.item_type[0] ?? release.tralbum.current.type[0];
    const match = response.tralbums?.find(
        item => item.tralbum_type === wantedType && item.tralbum_id === release.tralbum.id,
    );
    if (!match || !match.sale_item_type || match.sale_item_id === undefined) {
        throw new Error('Could not find this release in the Bandcamp collection');
    }
    const saleId = `${match.sale_item_type}${match.sale_item_id}`;
    const cookedUrl = response.redownload_urls?.[saleId];
    if (!cookedUrl) {
        throw new Error('Bandcamp did not return a redownload URL for this release');
    }
    return normalizeCookedUrl(cookedUrl);
}

export function classifyRelease(
    release: ReleaseInfo,
): 'direct-free' | 'email-gated' | 'previous-download' | 'purchased' | 'unavailable' {
    if (release.paymentDownloadPage) {
        return 'previous-download';
    }
    if (release.tralbum.freeDownloadPage) {
        return 'direct-free';
    }
    if (release.isFree) {
        return 'email-gated';
    }
    if (release.tralbum.is_purchased) {
        return 'purchased';
    }
    return 'unavailable';
}
