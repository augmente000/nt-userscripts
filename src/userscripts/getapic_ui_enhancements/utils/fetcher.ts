import { extractPreviewHtmlFromPage } from './parser.ts';

export async function fetchSessionPreviews(sessionUrl: string): Promise<string> {
    const response = await fetch(sessionUrl, {
        method: 'GET',
        credentials: 'same-origin',
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch session: ${response.status}`);
    }

    const html = await response.text();
    return extractPreviewHtmlFromPage(html);
}

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}
