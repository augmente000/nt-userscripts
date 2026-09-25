import { extractBandcampReleaseUrl } from '../shared/bandcamp';
import { PersistentCache } from '../shared/cache';
import type { SiteAdapter, SiteRelease } from '../shared/types';

const BANDCAMP_URL_CACHE_KEY = 'nt-bandcodes-collection-checker:bandcamp-urls:v1';
const FAILED_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const CARD_SELECTOR = 'div.group.border';

interface BandcampUrlCacheEntry {
    bandcampUrl: string | null;
    cachedAt: number;
}

function isBandcampUrlCacheEntry(value: unknown): value is BandcampUrlCacheEntry {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }

    const entry = value as Record<string, unknown>;
    return (
        (typeof entry['bandcampUrl'] === 'string' || entry['bandcampUrl'] === null) &&
        typeof entry['cachedAt'] === 'number'
    );
}

const bandcampUrlCache = new PersistentCache(BANDCAMP_URL_CACHE_KEY, isBandcampUrlCacheEntry);

function getCachedBandcampUrl(releasePageUrl: string): string | null | undefined {
    const entry = bandcampUrlCache.get(releasePageUrl);
    if (!entry) {
        return undefined;
    }

    if (entry.bandcampUrl === null && Date.now() - entry.cachedAt >= FAILED_CACHE_TTL_MS) {
        bandcampUrlCache.delete(releasePageUrl);
        return undefined;
    }

    return entry.bandcampUrl;
}

async function getBandcampUrl(releasePageUrl: string): Promise<string | null> {
    const cachedUrl = getCachedBandcampUrl(releasePageUrl);
    if (cachedUrl !== undefined) {
        return cachedUrl;
    }

    const response = await fetch(releasePageUrl, {
        credentials: 'same-origin',
        headers: { Accept: 'text/html' },
    });
    if (!response.ok) {
        throw new Error(`Band.codes release request failed with HTTP ${response.status}.`);
    }

    const bandcampUrl = extractBandcampReleaseUrl(await response.text());
    bandcampUrlCache.set(releasePageUrl, {
        bandcampUrl,
        cachedAt: Date.now(),
    });
    return bandcampUrl;
}

function findReleases(document: Document): SiteRelease[] {
    const releases: SiteRelease[] = [];

    for (const heading of document.querySelectorAll<HTMLElement>('a[href] > h3')) {
        const anchor = heading.parentElement;
        const card = heading.closest<HTMLElement>(CARD_SELECTOR);
        if (!(anchor instanceof HTMLAnchorElement) || !card) {
            continue;
        }

        const releaseUrl = new URL(anchor.href, window.location.href);
        const pathSegments = releaseUrl.pathname.split('/').filter(Boolean);
        if (releaseUrl.origin !== window.location.origin || pathSegments.length !== 2) {
            continue;
        }

        releaseUrl.hash = '';
        releaseUrl.search = '';
        const releasePageUrl = releaseUrl.href;
        releases.push({
            element: card,
            getExternalUrl: () => getBandcampUrl(releasePageUrl),
            key: releasePageUrl,
        });
    }

    return releases;
}

export const bandcodesAdapter: SiteAdapter = {
    id: 'bandcodes',
    matches: url => url.hostname === 'band.codes',
    findReleases,
};
