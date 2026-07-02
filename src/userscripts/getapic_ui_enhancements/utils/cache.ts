import type { CachedPreviews } from './types.ts';

const STORAGE_PREFIX = 'nt-getapic-previews:';
/** ~6 weeks — middle of the requested 1–2 month range */
export const CACHE_TTL_MS = 45 * 24 * 60 * 60 * 1000;

function storageKey(sessionId: string): string {
    return `${STORAGE_PREFIX}${sessionId}`;
}

function getStorage(): Storage {
    return unsafeWindow.localStorage;
}

export function getCachedPreviews(sessionId: string): string | null {
    const raw = getStorage().getItem(storageKey(sessionId));
    if (!raw) {
        return null;
    }

    try {
        const cached = JSON.parse(raw) as CachedPreviews;
        if (typeof cached.html !== 'string' || typeof cached.fetchedAt !== 'number') {
            return null;
        }

        if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) {
            getStorage().removeItem(storageKey(sessionId));
            return null;
        }

        return cached.html;
    } catch {
        getStorage().removeItem(storageKey(sessionId));
        return null;
    }
}

export function setCachedPreviews(sessionId: string, html: string): void {
    const entry: CachedPreviews = {
        html,
        fetchedAt: Date.now(),
    };
    getStorage().setItem(storageKey(sessionId), JSON.stringify(entry));
}

export function clearCachedPreviews(sessionId: string): void {
    getStorage().removeItem(storageKey(sessionId));
}
