import type { SessionRow } from './types.ts';

const SESSION_ROW_ID_PATTERN = /^set-(\d+)$/;
const ALL_PREVIEWS_LABEL = 'Все HTML превью';
const SINGLE_IMAGE_HTML_LABEL = 'HTML картинка в тексте:';

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

function findSingleImageHtmlInputs(doc: Document): string[] {
    const values: string[] = [];

    for (const li of doc.querySelectorAll('li')) {
        const label = li.querySelector('span');
        if (!label?.textContent?.includes(SINGLE_IMAGE_HTML_LABEL)) {
            continue;
        }

        const input = li.querySelector<HTMLInputElement>('input.form-control');
        const value = input?.value.trim();
        if (value) {
            values.push(value);
        }
    }

    return values;
}

export function extractPreviewHtmlFromPage(html: string): string {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const textarea = findAllPreviewsTextarea(doc);
    if (textarea) {
        const content = textarea.value.trim() || textarea.textContent?.trim() || '';
        if (content) {
            return content;
        }
    }

    const singleImageHtmlValues = findSingleImageHtmlInputs(doc);
    if (singleImageHtmlValues.length > 0) {
        return singleImageHtmlValues.join(' ');
    }

    return '';
}
