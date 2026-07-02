import type { SessionRow } from './types.ts';

const SESSION_ROW_ID_PATTERN = /^set-(\d+)$/;
const ALL_PREVIEWS_LABEL = 'Все HTML превью';

export function extractSessionsFromTable(table: HTMLTableElement): SessionRow[] {
    const sessions: SessionRow[] = [];

    for (const row of table.querySelectorAll<HTMLTableRowElement>('tbody tr[id^="set-"]')) {
        const match = SESSION_ROW_ID_PATTERN.exec(row.id);
        if (!match) {
            continue;
        }

        const link = row.querySelector<HTMLAnchorElement>('td a[href^="/rs/"]');
        if (!link) {
            continue;
        }

        sessions.push({
            sessionId: match[1]!,
            url: new URL(link.getAttribute('href') ?? '', location.origin).href,
            row,
        });
    }

    return sessions;
}

function findAllPreviewsTextarea(doc: Document): HTMLTextAreaElement | null {
    for (const li of doc.querySelectorAll('li')) {
        const label = li.querySelector('span');
        if (!label?.textContent?.includes(ALL_PREVIEWS_LABEL)) {
            continue;
        }

        const textarea = li.querySelector<HTMLTextAreaElement>('textarea.form-control');
        if (textarea) {
            return textarea;
        }
    }

    return null;
}

export function extractPreviewHtmlFromPage(html: string): string {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const textarea = findAllPreviewsTextarea(doc);
    if (!textarea) {
        return '';
    }

    return textarea.value.trim() || textarea.textContent?.trim() || '';
}
