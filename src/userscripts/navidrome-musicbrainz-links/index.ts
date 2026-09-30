interface MusicBrainzRelation {
    ended?: unknown;
    url?: {
        resource?: unknown;
    };
}

interface MusicBrainzReleaseResponse {
    error?: unknown;
    relations?: unknown;
}

interface ExternalRelation {
    url: URL;
}

interface CachedReleaseLinks {
    urls: string[];
}

interface HttpResponse {
    body: string;
    status: number;
}

interface CmsRelease {
    id: string;
}

const MUSICBRAINZ_API_ROOT = 'https://musicbrainz.org/ws/2/release';
const CMS_API_ROOT = 'https://api.new-team.me/api/v1/releases';
const CMS_ROOT = 'https://cms.new-team.me';
const CMS_TOKEN_STORAGE_KEY = 'new-team-cms-api-token';
const CMS_LOGO_URL = 'https://raw.githubusercontent.com/augmente000/browser-userscripts/master/src/assets/cms-logo.svg';
const BUSY_ERROR = 'The MusicBrainz web server is currently busy. Please try again later.';
const BUSY_RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 16_000] as const;
const CACHE_PREFIX = 'nt-navidrome-musicbrainz-release:v2:';
const CONTAINER_CLASS = 'mb-external-links';
const MUSICBRAINZ_RELEASE_PATTERN =
    /^\/release\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:\/|$)/iu;
const inFlightRequests = new Map<string, Promise<ExternalRelation[]>>();
const cmsInFlightRequests = new Map<string, Promise<CmsRelease | undefined>>();
let cmsTokenSetupDismissed = false;

class MusicBrainzBusyError extends Error {}

function cacheKey(releaseId: string): string {
    return `${CACHE_PREFIX}${releaseId}`;
}

function readCachedLinks(releaseId: string): ExternalRelation[] | undefined {
    const key = cacheKey(releaseId);

    try {
        const stored = localStorage.getItem(key);
        if (!stored) {
            return undefined;
        }

        const parsed: unknown = JSON.parse(stored);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            localStorage.removeItem(key);
            return undefined;
        }

        const cached = parsed as Partial<CachedReleaseLinks>;
        if (!Array.isArray(cached.urls) || !cached.urls.every(url => typeof url === 'string')) {
            localStorage.removeItem(key);
            return undefined;
        }

        return cached.urls.flatMap(resource => {
            const url = externalUrl(resource);
            return url ? [{ url }] : [];
        });
    } catch {
        try {
            localStorage.removeItem(key);
        } catch {
            // A request can still be made when storage is unavailable.
        }
        return undefined;
    }
}

function cacheLinks(releaseId: string, relations: ExternalRelation[]): void {
    try {
        const cached: CachedReleaseLinks = { urls: relations.map(relation => relation.url.href) };
        localStorage.setItem(cacheKey(releaseId), JSON.stringify(cached));
    } catch (error) {
        console.warn('[Navidrome MusicBrainz Links] Could not cache the release links.', error);
    }
}

function requestRelease(releaseId: string): Promise<HttpResponse> {
    const url = `${MUSICBRAINZ_API_ROOT}/${releaseId}?fmt=json&inc=url-rels`;

    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: 'GET',
            url,
            headers: {
                Accept: 'application/json',
            },
            responseType: 'text',
            timeout: 30_000,
            onload: response => {
                if (typeof response.responseText !== 'string') {
                    reject(new Error('MusicBrainz returned an invalid response body.'));
                    return;
                }

                resolve({ body: response.responseText, status: response.status });
            },
            onabort: () => reject(new Error('The MusicBrainz request was aborted.')),
            onerror: response =>
                reject(new Error(`The MusicBrainz request failed (HTTP ${response.status || 'unknown'}).`)),
            ontimeout: () => reject(new Error('The MusicBrainz request timed out.')),
        });
    });
}

function requestCmsRelease(releaseId: string, token: string): Promise<HttpResponse> {
    const url = new URL(CMS_API_ROOT);
    url.searchParams.set('musicbrainzId', releaseId);
    url.searchParams.set('limit', '1');

    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: 'GET',
            url: url.href,
            headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${token}`,
            },
            responseType: 'text',
            timeout: 30_000,
            onload: response => {
                if (typeof response.responseText !== 'string') {
                    reject(new Error('The CMS API returned an invalid response body.'));
                    return;
                }

                resolve({ body: response.responseText, status: response.status });
            },
            onabort: () => reject(new Error('The CMS API request was aborted.')),
            onerror: response =>
                reject(new Error(`The CMS API request failed (HTTP ${response.status || 'unknown'}).`)),
            ontimeout: () => reject(new Error('The CMS API request timed out.')),
        });
    });
}

function releaseRecords(value: unknown): Record<string, unknown>[] {
    if (Array.isArray(value)) {
        return value.filter(
            (item): item is Record<string, unknown> =>
                typeof item === 'object' && item !== null && !Array.isArray(item),
        );
    }
    if (typeof value !== 'object' || value === null) {
        return [];
    }

    const record = value as Record<string, unknown>;
    if (typeof record['id'] === 'string' || typeof record['id'] === 'number') {
        return [record];
    }

    for (const key of ['data', 'items', 'results', 'releases']) {
        const records = releaseRecords(record[key]);
        if (records.length > 0) {
            return records;
        }
    }
    return [];
}

function parseCmsReleaseResponse(response: HttpResponse): CmsRelease | undefined {
    let parsed: unknown;
    try {
        parsed = JSON.parse(response.body);
    } catch {
        throw new Error(`The CMS API returned invalid JSON (HTTP ${response.status}).`);
    }

    if (response.status < 200 || response.status >= 300) {
        throw new Error(`The CMS API returned HTTP ${response.status}.`);
    }

    const release = releaseRecords(parsed)[0];
    const id = release?.['id'];
    if (typeof id !== 'string' && typeof id !== 'number') {
        return undefined;
    }
    return { id: String(id) };
}

function getCmsToken(): string | undefined {
    const storedToken = GM_getValue(CMS_TOKEN_STORAGE_KEY, '').trim();
    if (storedToken || cmsTokenSetupDismissed) {
        return storedToken || undefined;
    }

    const token = window.prompt('Enter the New Team CMS API token:');
    if (token === null) {
        cmsTokenSetupDismissed = true;
        return undefined;
    }

    const trimmedToken = token.trim();
    if (!trimmedToken) {
        window.alert('A New Team CMS API token is required. The token was not saved.');
        cmsTokenSetupDismissed = true;
        return undefined;
    }

    GM_setValue(CMS_TOKEN_STORAGE_KEY, trimmedToken);
    return trimmedToken;
}

function getCmsRelease(releaseId: string): Promise<CmsRelease | undefined> {
    const token = getCmsToken();
    if (!token) {
        return Promise.resolve(undefined);
    }

    const activeRequest = cmsInFlightRequests.get(releaseId);
    if (activeRequest) {
        return activeRequest;
    }

    let request: Promise<CmsRelease | undefined>;
    request = requestCmsRelease(releaseId, token)
        .then(parseCmsReleaseResponse)
        .finally(() => {
            if (cmsInFlightRequests.get(releaseId) === request) {
                cmsInFlightRequests.delete(releaseId);
            }
        });
    cmsInFlightRequests.set(releaseId, request);
    return request;
}

function parseReleaseResponse(response: HttpResponse): MusicBrainzReleaseResponse {
    let parsed: unknown;
    try {
        parsed = JSON.parse(response.body);
    } catch {
        throw new Error(`MusicBrainz returned invalid JSON (HTTP ${response.status}).`);
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('MusicBrainz returned an unexpected response.');
    }

    const release = parsed as MusicBrainzReleaseResponse;
    if (release.error === BUSY_ERROR) {
        throw new MusicBrainzBusyError(BUSY_ERROR);
    }

    if (response.status < 200 || response.status >= 300) {
        const detail = typeof release.error === 'string' ? `: ${release.error}` : '';
        throw new Error(`MusicBrainz returned HTTP ${response.status}${detail}`);
    }

    if (typeof release.error === 'string') {
        throw new Error(`MusicBrainz returned an error: ${release.error}`);
    }

    return release;
}

function wait(milliseconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function fetchLinks(releaseId: string): Promise<ExternalRelation[]> {
    const cached = readCachedLinks(releaseId);
    if (cached) {
        return cached;
    }

    for (let attempt = 0; ; attempt += 1) {
        try {
            const release = parseReleaseResponse(await requestRelease(releaseId));
            const relations = externalRelations(release);
            cacheLinks(releaseId, relations);
            return relations;
        } catch (error) {
            const retryDelay = BUSY_RETRY_DELAYS_MS[attempt];
            if (!(error instanceof MusicBrainzBusyError) || retryDelay === undefined) {
                throw error;
            }

            console.info(`[Navidrome MusicBrainz Links] MusicBrainz is busy; retrying in ${retryDelay / 1_000}s.`);
            await wait(retryDelay);
        }
    }
}

function getLinks(releaseId: string): Promise<ExternalRelation[]> {
    const activeRequest = inFlightRequests.get(releaseId);
    if (activeRequest) {
        return activeRequest;
    }

    const request = fetchLinks(releaseId).finally(() => inFlightRequests.delete(releaseId));
    inFlightRequests.set(releaseId, request);
    return request;
}

function isMusicBrainzHost(hostname: string): boolean {
    const normalized = hostname.toLowerCase();
    return normalized === 'musicbrainz.org' || normalized.endsWith('.musicbrainz.org');
}

function externalUrl(resource: unknown): URL | undefined {
    if (typeof resource !== 'string') {
        return undefined;
    }

    try {
        const url = new URL(resource);
        if ((url.protocol !== 'http:' && url.protocol !== 'https:') || isMusicBrainzHost(url.hostname)) {
            return undefined;
        }
        return url;
    } catch {
        return undefined;
    }
}

function relationUrl(relation: MusicBrainzRelation): URL | undefined {
    return externalUrl(relation.url?.resource);
}

function externalRelations(release: MusicBrainzReleaseResponse): ExternalRelation[] {
    if (!Array.isArray(release.relations)) {
        return [];
    }

    const seen = new Set<string>();
    const external: ExternalRelation[] = [];

    for (const candidate of release.relations) {
        if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
            continue;
        }

        const relation = candidate as MusicBrainzRelation;
        const url = relationUrl(relation);
        if (relation.ended === true || !url || seen.has(url.href)) {
            continue;
        }

        seen.add(url.href);
        external.push({ url });
    }

    return external;
}

function displayHostname(hostname: string): string {
    return hostname.replace(/^www\./iu, '');
}

function faviconUrl(url: URL): string {
    const favicon = new URL('https://www.google.com/s2/favicons');
    favicon.searchParams.set('sz', '32');
    favicon.searchParams.set('domain_url', url.origin);
    return favicon.href;
}

function createRelationLink(relation: ExternalRelation): HTMLAnchorElement {
    const hostname = displayHostname(relation.url.hostname);
    const link = document.createElement('a');
    const image = document.createElement('img');

    link.className = 'mb-external-link';
    link.href = relation.url.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.title = hostname;
    link.setAttribute('aria-label', `Open ${hostname}`);

    image.src = faviconUrl(relation.url);
    image.alt = '';
    image.width = 18;
    image.height = 18;
    image.loading = 'lazy';
    link.append(image);
    return link;
}

function createCmsLink(release: CmsRelease): HTMLAnchorElement {
    const link = document.createElement('a');
    const image = document.createElement('img');

    link.className = 'mb-external-link cms-release-link';
    link.href = `${CMS_ROOT}/releases/${encodeURIComponent(release.id)}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.title = 'Open in New Team CMS';
    link.setAttribute('aria-label', 'Open release in New Team CMS');

    image.src = CMS_LOGO_URL;
    image.alt = '';
    image.width = 18;
    image.height = 18;
    link.append(image);
    return link;
}

function renderRelations(container: HTMLElement, relations: ExternalRelation[]): void {
    container.replaceChildren(...relations.map(createRelationLink));
    container.removeAttribute('aria-busy');
}

function renderCmsRelease(container: HTMLElement, release: CmsRelease | undefined): void {
    if (release) {
        container.append(createCmsLink(release));
    }
}

function renderError(container: HTMLElement, releaseId: string, error: unknown): void {
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'mb-retry';
    retry.textContent = '!';
    retry.title = 'Could not load MusicBrainz links. Click to retry.';
    retry.setAttribute('aria-label', 'Retry loading MusicBrainz links');
    retry.addEventListener('click', () => {
        container.replaceChildren();
        container.dataset['state'] = 'loading';
        container.setAttribute('aria-busy', 'true');
        void loadIntoContainer(container, releaseId);
    });

    container.dataset['state'] = 'error';
    container.removeAttribute('aria-busy');
    container.replaceChildren(retry);
    console.error('[Navidrome MusicBrainz Links] Could not load release relationships.', error);
}

async function loadIntoContainer(container: HTMLElement, releaseId: string): Promise<void> {
    const cmsReleasePromise = getCmsRelease(releaseId).catch(error => {
        console.error('[Navidrome MusicBrainz Links] Could not look up the CMS release.', error);
        return undefined;
    });

    try {
        const relations = await getLinks(releaseId);
        if (!container.isConnected || container.dataset['releaseId'] !== releaseId) {
            return;
        }

        container.dataset['state'] = 'ready';
        renderRelations(container, relations);
    } catch (error) {
        if (container.isConnected && container.dataset['releaseId'] === releaseId) {
            renderError(container, releaseId, error);
        }
        return;
    }

    const cmsRelease = await cmsReleasePromise;
    if (container.isConnected && container.dataset['releaseId'] === releaseId) {
        renderCmsRelease(container, cmsRelease);
    }
}

function releaseIdFromLink(link: HTMLAnchorElement): string | undefined {
    try {
        const url = new URL(link.href);
        if (!isMusicBrainzHost(url.hostname)) {
            return undefined;
        }
        return MUSICBRAINZ_RELEASE_PATTERN.exec(url.pathname)?.[1]?.toLowerCase();
    } catch {
        return undefined;
    }
}

function insertionPoint(link: HTMLAnchorElement): Element {
    const parent = link.parentElement;
    return parent?.tagName === 'SPAN' && parent.children.length === 1 ? parent : link;
}

function enhanceMusicBrainzLink(link: HTMLAnchorElement): void {
    const releaseId = releaseIdFromLink(link);
    if (!releaseId) {
        return;
    }

    const point = insertionPoint(link);
    const next = point.nextElementSibling;
    if (next instanceof HTMLElement && next.classList.contains(CONTAINER_CLASS)) {
        if (next.dataset['releaseId'] === releaseId) {
            return;
        }
        next.remove();
    }

    const container = document.createElement('span');
    container.className = CONTAINER_CLASS;
    container.dataset['releaseId'] = releaseId;
    container.dataset['state'] = 'loading';
    container.setAttribute('aria-busy', 'true');
    point.after(container);
    void loadIntoContainer(container, releaseId);
}

function scan(): void {
    for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href*="musicbrainz.org/release/"]')) {
        enhanceMusicBrainzLink(link);
    }
}

function addStyles(): void {
    if (document.querySelector('style[data-mb-external-links]')) {
        return;
    }

    const style = document.createElement('style');
    style.dataset['ntMbExternalLinks'] = '';
    style.textContent = `
        .${CONTAINER_CLASS} {
            display: inline-flex;
            align-items: center;
            gap: 3px;
            margin-left: 3px;
            vertical-align: middle;
        }
        .${CONTAINER_CLASS}[data-state="loading"]::after {
            content: "\u2026";
            width: 18px;
            text-align: center;
            opacity: 0.6;
        }
        .mb-external-link,
        .mb-retry {
            box-sizing: content-box;
            display: inline-flex;
            width: 18px;
            height: 18px;
            align-items: center;
            justify-content: center;
            padding: 5px;
            border: 0;
            border-radius: 50%;
            background: transparent;
            color: inherit;
            cursor: pointer;
            line-height: 18px;
            text-decoration: none;
        }
        .mb-external-link:hover,
        .mb-external-link:focus-visible,
        .mb-retry:hover,
        .mb-retry:focus-visible {
            background: rgba(128, 128, 128, 0.18);
        }
        .mb-external-link img {
            display: block;
            width: 18px;
            height: 18px;
            border-radius: 3px;
        }
        .mb-retry {
            font: 700 14px/18px sans-serif;
        }
    `;
    document.head.append(style);
}

function init(): void {
    addStyles();
    scan();

    let scanPending = false;
    const scheduleScan = (): void => {
        if (scanPending) {
            return;
        }
        scanPending = true;
        queueMicrotask(() => {
            scanPending = false;
            scan();
        });
    };

    // Watch subtree and href changes for client-side navigation, coalescing related scans.
    new MutationObserver(scheduleScan).observe(document.body, {
        attributeFilter: ['href'],
        attributes: true,
        childList: true,
        subtree: true,
    });
    window.addEventListener('hashchange', scheduleScan);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
    init();
}
