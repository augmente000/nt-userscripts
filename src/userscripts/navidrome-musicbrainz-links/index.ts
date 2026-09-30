interface MusicBrainzRelation {
    ended?: unknown;
    url?: {
        resource?: unknown;
    };
}

interface MusicBrainzReleaseResponse {
    'artist-credit'?: unknown;
    error?: unknown;
    'label-info'?: unknown;
    relations?: unknown;
    title?: unknown;
}

interface ExternalRelation {
    url: URL;
}

interface ReleaseDetails {
    artistName: string | undefined;
    labelName: string | undefined;
    relations: ExternalRelation[];
    releaseName: string | undefined;
}

interface CachedReleaseDetails {
    artistName: string | undefined;
    labelName: string | undefined;
    releaseName: string | undefined;
    urls: string[];
}

interface HttpResponse {
    body: string;
    status: number;
}

interface CmsRelease {
    id: string;
}

interface CmsLookupResult {
    checked: boolean;
    release: CmsRelease | undefined;
}

interface CachedCmsLookup {
    releaseId: string;
}

const MUSICBRAINZ_API_ROOT = 'https://musicbrainz.org/ws/2/release';
const CMS_API_ROOT = 'https://api.new-team.me/api/v1/releases';
const CMS_ROOT = 'https://cms.new-team.me';
const CMS_SEED_URL = `${CMS_ROOT}/api/seed`;
const CMS_TOKEN_STORAGE_KEY = 'new-team-cms-api-token';
const CMS_LOGO_URL = 'https://raw.githubusercontent.com/augmente000/nt-userscripts/master/src/assets/cms-logo.svg';
const BUSY_ERROR = 'The MusicBrainz web server is currently busy. Please try again later.';
const BUSY_RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 16_000] as const;
const CACHE_PREFIX = 'nt-navidrome-musicbrainz-release:v3:';
const CMS_CACHE_PREFIX = 'nt-navidrome-cms-release:v1:';
const CONTAINER_CLASS = 'mb-external-links';
const MUSICBRAINZ_RELEASE_PATTERN =
    /^\/release\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:\/|$)/iu;
const inFlightRequests = new Map<string, Promise<ReleaseDetails>>();
const cmsInFlightRequests = new Map<string, Promise<CmsLookupResult>>();
let cmsTokenSetupDismissed = false;

class MusicBrainzBusyError extends Error {}

function cacheKey(releaseId: string): string {
    return `${CACHE_PREFIX}${releaseId}`;
}

function cmsCacheKey(releaseId: string): string {
    return `${CMS_CACHE_PREFIX}${releaseId}`;
}

function optionalCachedText(value: unknown): string | undefined {
    return typeof value === 'string' && value ? value : undefined;
}

function readCachedRelease(releaseId: string): ReleaseDetails | undefined {
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

        const cached = parsed as Partial<CachedReleaseDetails>;
        if (!Array.isArray(cached.urls) || !cached.urls.every(url => typeof url === 'string')) {
            localStorage.removeItem(key);
            return undefined;
        }

        const relations = cached.urls.flatMap(resource => {
            const url = externalUrl(resource);
            return url ? [{ url }] : [];
        });
        return {
            artistName: optionalCachedText(cached.artistName),
            labelName: optionalCachedText(cached.labelName),
            relations,
            releaseName: optionalCachedText(cached.releaseName),
        };
    } catch {
        try {
            localStorage.removeItem(key);
        } catch {
            // A request can still be made when storage is unavailable.
        }
        return undefined;
    }
}

function cacheRelease(releaseId: string, release: ReleaseDetails): void {
    try {
        const cached: CachedReleaseDetails = {
            artistName: release.artistName,
            labelName: release.labelName,
            releaseName: release.releaseName,
            urls: release.relations.map(relation => relation.url.href),
        };
        localStorage.setItem(cacheKey(releaseId), JSON.stringify(cached));
    } catch (error) {
        console.warn('[Navidrome MusicBrainz Links] Could not cache the release links.', error);
    }
}

function readCachedCmsLookup(releaseId: string): CmsLookupResult | undefined {
    const key = cmsCacheKey(releaseId);

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

        const cachedReleaseId = (parsed as Partial<CachedCmsLookup>).releaseId;
        if (typeof cachedReleaseId !== 'string') {
            localStorage.removeItem(key);
            return undefined;
        }

        return {
            checked: true,
            release: { id: cachedReleaseId },
        };
    } catch {
        try {
            localStorage.removeItem(key);
        } catch {
            // A request can still be made when storage is unavailable.
        }
        return undefined;
    }
}

function cacheCmsLookup(releaseId: string, release: CmsRelease): void {
    try {
        const cached: CachedCmsLookup = { releaseId: release.id };
        localStorage.setItem(cmsCacheKey(releaseId), JSON.stringify(cached));
    } catch (error) {
        console.warn('[Navidrome MusicBrainz Links] Could not cache the CMS release.', error);
    }
}

function requestRelease(releaseId: string): Promise<HttpResponse> {
    const url = new URL(`${MUSICBRAINZ_API_ROOT}/${releaseId}`);
    url.searchParams.set('fmt', 'json');
    url.searchParams.set('inc', 'artist-credits+labels+url-rels');

    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: 'GET',
            url: url.href,
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

function getCmsRelease(releaseId: string, forceRefresh = false): Promise<CmsLookupResult> {
    if (!forceRefresh) {
        const cached = readCachedCmsLookup(releaseId);
        if (cached) {
            return Promise.resolve(cached);
        }
    }

    const token = getCmsToken();
    if (!token) {
        return Promise.resolve({ checked: false, release: undefined });
    }

    const activeRequest = cmsInFlightRequests.get(releaseId);
    if (activeRequest) {
        return activeRequest;
    }

    let request: Promise<CmsLookupResult>;
    request = requestCmsRelease(releaseId, token)
        .then(parseCmsReleaseResponse)
        .then(release => {
            if (release) {
                cacheCmsLookup(releaseId, release);
            }
            return { checked: true, release };
        })
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

function nonEmptyText(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    const trimmed = value.trim();
    return trimmed || undefined;
}

function artistCreditName(value: unknown): string | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }

    let name = '';
    for (const candidate of value) {
        if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
            continue;
        }

        const credit = candidate as Record<string, unknown>;
        const artist = credit['artist'];
        const artistRecord =
            typeof artist === 'object' && artist !== null && !Array.isArray(artist)
                ? (artist as Record<string, unknown>)
                : undefined;
        const creditName = nonEmptyText(credit['name']) ?? nonEmptyText(artistRecord?.['name']);
        if (!creditName) {
            continue;
        }

        name += creditName;
        name += typeof credit['joinphrase'] === 'string' ? credit['joinphrase'] : '';
    }

    return nonEmptyText(name);
}

function firstLabelName(value: unknown): string | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }

    for (const candidate of value) {
        if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
            continue;
        }

        const label = (candidate as Record<string, unknown>)['label'];
        if (typeof label !== 'object' || label === null || Array.isArray(label)) {
            continue;
        }

        const name = nonEmptyText((label as Record<string, unknown>)['name']);
        if (name) {
            return name;
        }
    }

    return undefined;
}

function releaseDetails(release: MusicBrainzReleaseResponse): ReleaseDetails {
    return {
        artistName: artistCreditName(release['artist-credit']),
        labelName: firstLabelName(release['label-info']),
        relations: externalRelations(release),
        releaseName: nonEmptyText(release.title),
    };
}

async function fetchRelease(releaseId: string): Promise<ReleaseDetails> {
    const cached = readCachedRelease(releaseId);
    if (cached) {
        return cached;
    }

    for (let attempt = 0; ; attempt += 1) {
        try {
            const release = parseReleaseResponse(await requestRelease(releaseId));
            const details = releaseDetails(release);
            cacheRelease(releaseId, details);
            return details;
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

function getRelease(releaseId: string): Promise<ReleaseDetails> {
    const activeRequest = inFlightRequests.get(releaseId);
    if (activeRequest) {
        return activeRequest;
    }

    const request = fetchRelease(releaseId).finally(() => inFlightRequests.delete(releaseId));
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

function cmsSeedUrl(releaseId: string, details: ReleaseDetails): string {
    const url = new URL(CMS_SEED_URL);
    url.searchParams.append('url', `https://musicbrainz.org/release/${releaseId}`);

    for (const relation of details.relations) {
        url.searchParams.append('url', relation.url.href);
    }

    if (details.artistName) {
        url.searchParams.set('artistName', details.artistName);
    }
    if (details.releaseName) {
        url.searchParams.set('releaseName', details.releaseName);
    }
    if (details.labelName) {
        url.searchParams.set('label', details.labelName);
    }

    return url.href;
}

function createSvgIcon(paths: string[]): SVGSVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');

    for (const pathData of paths) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData);
        svg.append(path);
    }

    return svg;
}

function createCmsLink(releaseId: string, details: ReleaseDetails, release: CmsRelease | undefined): HTMLAnchorElement {
    const link = document.createElement('a');
    const image = document.createElement('img');
    const exists = release !== undefined;

    link.className = `mb-external-link cms-release-link cms-release-${exists ? 'exists' : 'missing'}`;
    link.href = exists ? `${CMS_ROOT}/releases/${encodeURIComponent(release.id)}` : cmsSeedUrl(releaseId, details);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.title = exists ? 'Open in New Team CMS' : 'Import into New Team CMS';
    link.setAttribute('aria-label', exists ? 'Open release in New Team CMS' : 'Import release into New Team CMS');

    image.src = CMS_LOGO_URL;
    image.alt = '';
    image.width = 18;
    image.height = 18;
    link.append(image);
    return link;
}

function createCmsUploadLink(releaseId: string, details: ReleaseDetails): HTMLAnchorElement {
    const link = document.createElement('a');
    link.className = 'mb-external-link cms-upload-link';
    link.href = cmsSeedUrl(releaseId, details);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.title = 'Add missing links to this New Team CMS release';
    link.setAttribute('aria-label', 'Add missing links to this New Team CMS release');
    link.append(createSvgIcon(['M12 16V4m0 0-4 4m4-4 4 4', 'M5 15v4h14v-4']));
    return link;
}

function createCmsControls(
    container: HTMLElement,
    releaseId: string,
    details: ReleaseDetails,
    lookup: CmsLookupResult,
): HTMLElement {
    const controls = document.createElement('span');
    const refresh = document.createElement('button');
    controls.className = 'cms-release-controls';

    refresh.type = 'button';
    refresh.className = 'cms-refresh';
    refresh.title = 'Refresh New Team CMS status';
    refresh.setAttribute('aria-label', 'Refresh New Team CMS status');
    refresh.append(createSvgIcon(['M20 11a8 8 0 0 0-14.9-4M4 4v5h5', 'M4 13a8 8 0 0 0 14.9 4M20 20v-5h-5']));
    refresh.addEventListener('click', async () => {
        refresh.disabled = true;
        refresh.dataset['loading'] = '';

        try {
            const refreshedLookup = await getCmsRelease(releaseId, true);
            if (!refreshedLookup.checked) {
                throw new Error('The CMS lookup requires an API token.');
            }
            if (controls.isConnected && container.isConnected && container.dataset['releaseId'] === releaseId) {
                controls.replaceWith(createCmsControls(container, releaseId, details, refreshedLookup));
            }
        } catch (error) {
            refresh.disabled = false;
            delete refresh.dataset['loading'];
            refresh.title = 'CMS refresh failed. Click to retry.';
            console.error('[Navidrome MusicBrainz Links] Could not refresh CMS status.', error);
        }
    });

    controls.append(createCmsLink(releaseId, details, lookup.release), refresh);
    if (lookup.release) {
        controls.append(createCmsUploadLink(releaseId, details));
    }

    return controls;
}

function renderRelations(container: HTMLElement, relations: ExternalRelation[]): void {
    container.replaceChildren(...relations.map(createRelationLink));
    container.removeAttribute('aria-busy');
}

function renderCmsRelease(
    container: HTMLElement,
    releaseId: string,
    details: ReleaseDetails,
    lookup: CmsLookupResult,
): void {
    if (lookup.checked) {
        container.append(createCmsControls(container, releaseId, details, lookup));
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
        return { checked: false, release: undefined } satisfies CmsLookupResult;
    });

    let details: ReleaseDetails;
    try {
        details = await getRelease(releaseId);
        if (!container.isConnected || container.dataset['releaseId'] !== releaseId) {
            return;
        }

        container.dataset['state'] = 'ready';
        renderRelations(container, details.relations);
    } catch (error) {
        if (container.isConnected && container.dataset['releaseId'] === releaseId) {
            renderError(container, releaseId, error);
        }
        return;
    }

    const cmsRelease = await cmsReleasePromise;
    if (container.isConnected && container.dataset['releaseId'] === releaseId) {
        renderCmsRelease(container, releaseId, details, cmsRelease);
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
        .cms-release-controls {
            display: inline-flex;
            align-items: center;
            gap: 0;
            padding: 1px;
            border: 1px solid rgba(128, 128, 128, 0.35);
            border-radius: 8px;
            background: rgba(128, 128, 128, 0.08);
        }
        .cms-release-controls .mb-external-link {
            padding: 4px;
        }
        .cms-release-link.cms-release-exists img {
            border: 1px solid #fff;
        }
        .cms-release-link.cms-release-missing img {
            border: 1px solid #d32f2f;
        }
        .mb-external-link img {
            box-sizing: border-box;
            display: block;
            width: 18px;
            height: 18px;
            border-radius: 3px;
        }
        .cms-upload-link svg,
        .cms-refresh svg {
            width: 18px;
            height: 18px;
            fill: none;
            stroke: currentColor;
            stroke-width: 2;
            stroke-linecap: round;
            stroke-linejoin: round;
        }
        .cms-refresh {
            box-sizing: border-box;
            display: inline-flex;
            width: 18px;
            height: 18px;
            align-items: center;
            justify-content: center;
            padding: 2px;
            border: 0;
            border-radius: 50%;
            background: transparent;
            color: inherit;
            cursor: pointer;
            opacity: 0.65;
        }
        .cms-refresh:hover,
        .cms-refresh:focus-visible {
            background: rgba(128, 128, 128, 0.18);
            opacity: 1;
        }
        .cms-refresh:disabled {
            cursor: wait;
        }
        .cms-refresh svg {
            width: 14px;
            height: 14px;
        }
        .cms-refresh[data-loading] svg {
            animation: cms-refresh-spin 0.8s linear infinite;
        }
        @keyframes cms-refresh-spin {
            to {
                transform: rotate(360deg);
            }
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
