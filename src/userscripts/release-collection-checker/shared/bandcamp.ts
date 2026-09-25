const BANDCAMP_RELEASE_URL_PATTERN = /https?:\/\/[^\s"'\\<>]+\.bandcamp\.com\/(?:album|track)\/[^\s"'\\<>]+/giu;
const JSON_LD_SCRIPT_PATTERN =
    /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/giu;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeBandcampReleaseUrl(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    const unescapedValue = value.replaceAll('\\/', '/').replaceAll('&amp;', '&');

    try {
        const url = new URL(unescapedValue);
        const isBandcampHost = url.hostname === 'bandcamp.com' || url.hostname.endsWith('.bandcamp.com');
        const isReleasePath = /^\/(?:album|track)\/[^/]+/u.test(url.pathname);

        if (!isBandcampHost || !isReleasePath) {
            return null;
        }

        url.hash = '';
        return url.href;
    } catch {
        return null;
    }
}

function findReleaseUrlInStructuredData(value: unknown): string | null {
    if (Array.isArray(value)) {
        for (const item of value) {
            const url = findReleaseUrlInStructuredData(item);
            if (url) {
                return url;
            }
        }

        return null;
    }

    if (!isRecord(value)) {
        return null;
    }

    const directCandidates = [value['bandcampUrl']];
    const potentialAction = value['potentialAction'];
    if (isRecord(potentialAction)) {
        directCandidates.push(potentialAction['target']);
    }

    for (const candidate of directCandidates) {
        const url = normalizeBandcampReleaseUrl(candidate);
        if (url) {
            return url;
        }
    }

    for (const child of Object.values(value)) {
        const url = findReleaseUrlInStructuredData(child);
        if (url) {
            return url;
        }
    }

    return null;
}

export function extractBandcampReleaseUrl(html: string): string | null {
    for (const match of html.matchAll(JSON_LD_SCRIPT_PATTERN)) {
        const scriptContents = match[1];
        if (!scriptContents) {
            continue;
        }

        try {
            const url = findReleaseUrlInStructuredData(JSON.parse(scriptContents) as unknown);
            if (url) {
                return url;
            }
        } catch {
            // Fall through to the URL scan. Next.js also embeds the release URL in its payload.
        }
    }

    const normalizedHtml = html.replaceAll('\\/', '/');
    for (const match of normalizedHtml.matchAll(BANDCAMP_RELEASE_URL_PATTERN)) {
        const url = normalizeBandcampReleaseUrl(match[0]);
        if (url) {
            return url;
        }
    }

    return null;
}
