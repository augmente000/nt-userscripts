function isBandcampUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return (
            parsed.protocol === 'https:' &&
            (parsed.hostname === 'bandcamp.com' || parsed.hostname.endsWith('.bandcamp.com'))
        );
    } catch {
        return false;
    }
}

/** Bridge the page's cookie jar and the userscript manager's background requests. */
export function paymentsCookie(url: string): string | undefined {
    if (!isBandcampUrl(url)) {
        return undefined;
    }
    return document.cookie
        ?.split(';')
        .map(cookie => cookie.trim())
        .find(cookie => cookie.startsWith('payments='));
}

export function rememberPaymentsCookie(requestUrl: string, finalUrl: string, headers: string): void {
    if (!isBandcampUrl(requestUrl) || !isBandcampUrl(finalUrl)) {
        return;
    }
    for (const line of headers.split(/\r?\n/)) {
        const cookie = /^set-cookie:\s*(payments=[^\r\n]*)$/i.exec(line)?.[1];
        if (!cookie) {
            continue;
        }
        // Preserve the complete server-signed value and its expiry. Editing or merging
        // the ID/token pairs invalidates the signature. Never copy unrelated cookies.
        try {
            document.cookie = cookie;
        } catch {
            console.warn('[Bandcamp Collection Downloader] Could not save download authorization cookie');
        }
    }
}
