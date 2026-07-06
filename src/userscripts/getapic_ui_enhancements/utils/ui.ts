import type { SessionRow } from './types.ts';

const PREVIEW_CELL_CLASS = 'nt-getapic-preview-cell';
const PREVIEW_CONTAINER_CLASS = 'nt-getapic-previews';
const MARKER_ATTR = 'data-nt-getapic-previews';

const OPEN_ALL_MARKER_ATTR = 'data-nt-getapic-open-all';
const REFRESH_ALL_MARKER_ATTR = 'data-nt-getapic-refresh-all';
const CLAIM_ALL_MARKER_ATTR = 'data-nt-getapic-claim-all';
const ANON_ACTIONS_MARKER_ATTR = 'data-nt-getapic-anon-actions';
const JUMBOTRON_SELECTOR = '.jumbotron.medium-height.align-left';
const ANON_BUTTON_SELECTOR = 'a.btn.btn-xs.btn-primary';
const OPEN_ALL_BUTTON_LABEL = 'Открыть все сессии';
const REFRESH_ALL_BUTTON_LABEL = '↻ Обновить превью';
const CLAIM_ALL_BUTTON_LABEL = 'Забрать все сессии себе';

export function isAnonymousSessionsPage(): boolean {
    return new URLSearchParams(location.search).get('anon') === '1';
}

export function ensurePreviewColumn(table: HTMLTableElement): void {
    if (table.querySelector(`.${PREVIEW_CELL_CLASS}`)) {
        return;
    }

    const headerRow = table.querySelector('thead tr');
    if (headerRow) {
        const header = document.createElement('th');
        header.textContent = 'Превью';
        headerRow.insertBefore(header, headerRow.firstChild);
    }
}

function getOrCreatePreviewCell(row: HTMLTableRowElement): HTMLTableCellElement {
    let cell = row.querySelector<HTMLTableCellElement>(`.${PREVIEW_CELL_CLASS}`);
    if (cell) {
        return cell;
    }

    cell = document.createElement('td');
    cell.className = PREVIEW_CELL_CLASS;
    row.insertBefore(cell, row.firstChild);
    return cell;
}

function stylePreviewImages(container: HTMLElement): void {
    for (const img of container.querySelectorAll('img')) {
        img.loading = 'lazy';
        Object.assign(img.style, {
            maxHeight: '80px',
            maxWidth: '120px',
            margin: '2px',
            objectFit: 'contain',
            verticalAlign: 'middle',
        });
    }
}

export function renderLoadingState(row: HTMLTableRowElement): void {
    const cell = getOrCreatePreviewCell(row);
    cell.textContent = '…';
    cell.style.color = '#888';
    cell.style.fontSize = '12px';
}

export function renderErrorState(row: HTMLTableRowElement): void {
    const cell = getOrCreatePreviewCell(row);
    cell.replaceChildren();

    const label = document.createElement('span');
    label.textContent = 'ошибка';
    label.style.color = '#c00';
    label.style.fontSize = '12px';
    cell.append(label);
}

export function renderPreviews(row: HTMLTableRowElement, previewHtml: string): void {
    const cell = getOrCreatePreviewCell(row);
    cell.replaceChildren();
    cell.style.color = '';

    const container = document.createElement('span');
    container.className = PREVIEW_CONTAINER_CLASS;
    Object.assign(container.style, {
        display: 'inline-flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '2px',
        maxWidth: '420px',
    });

    if (!previewHtml) {
        const empty = document.createElement('span');
        empty.textContent = '—';
        empty.style.color = '#888';
        empty.style.fontSize = '12px';
        container.append(empty);
    } else {
        container.insertAdjacentHTML('beforeend', previewHtml);
        stylePreviewImages(container);
    }

    cell.appendChild(container);
}

export function isRowProcessed(row: HTMLTableRowElement): boolean {
    return row.hasAttribute(MARKER_ATTR);
}

export function markRowProcessed(row: HTMLTableRowElement): void {
    row.setAttribute(MARKER_ATTR, '1');
}

function openSessionInBackgroundTab(url: string): void {
    GM_openInTab(url, { active: false });
}

export function ensureOpenAllSessionsButton(sessions: SessionRow[]): void {
    const jumbotron = document.querySelector<HTMLElement>(JUMBOTRON_SELECTOR);
    if (!jumbotron || jumbotron.querySelector(`[${OPEN_ALL_MARKER_ATTR}]`)) {
        return;
    }

    const flexColumn = jumbotron.querySelector('.flex.flex-column');
    if (!flexColumn) {
        return;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-xs btn-primary';
    button.textContent = OPEN_ALL_BUTTON_LABEL;
    button.setAttribute(OPEN_ALL_MARKER_ATTR, '1');
    button.title = `Открыть ${sessions.length} сессий в фоновых вкладках`;
    button.disabled = sessions.length === 0;
    button.style.marginLeft = '6px';

    button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();

        for (const session of sessions) {
            openSessionInBackgroundTab(session.url);
        }
    });

    const anonButton = jumbotron.querySelector<HTMLAnchorElement>(ANON_BUTTON_SELECTOR);
    if (anonButton) {
        anonButton.insertAdjacentElement('afterend', button);
    } else {
        flexColumn.insertAdjacentElement('beforebegin', button);
    }
}

export function ensureRefreshAllPreviewsButton(onRefresh: () => void): void {
    const jumbotron = document.querySelector<HTMLElement>(JUMBOTRON_SELECTOR);
    if (!jumbotron || jumbotron.querySelector(`[${REFRESH_ALL_MARKER_ATTR}]`)) {
        return;
    }

    const openAllButton = jumbotron.querySelector<HTMLButtonElement>(`[${OPEN_ALL_MARKER_ATTR}]`);
    if (!openAllButton) {
        return;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-xs btn-primary';
    button.textContent = REFRESH_ALL_BUTTON_LABEL;
    button.setAttribute(REFRESH_ALL_MARKER_ATTR, '1');
    button.title = 'Обновить превью всех сессий на странице';
    button.style.marginLeft = '6px';

    button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        onRefresh();
    });

    openAllButton.insertAdjacentElement('afterend', button);
}

function buildSessionActionUrl(sessionUrl: string, action: 'join' | 'delete'): string {
    const url = new URL(sessionUrl);
    return `${url.pathname}?${action}=1`;
}

async function claimSession(sessionUrl: string): Promise<void> {
    const response = await fetch(buildSessionActionUrl(sessionUrl, 'join'));
    if (!response.ok) {
        throw new Error(`Failed to claim session: ${response.status}`);
    }
}

export function ensureClaimAllSessionsButton(sessions: SessionRow[]): void {
    if (!isAnonymousSessionsPage()) {
        return;
    }

    const jumbotron = document.querySelector<HTMLElement>(JUMBOTRON_SELECTOR);
    if (!jumbotron || jumbotron.querySelector(`[${CLAIM_ALL_MARKER_ATTR}]`)) {
        return;
    }

    const anchorButton =
        jumbotron.querySelector<HTMLElement>(`[${REFRESH_ALL_MARKER_ATTR}]`) ??
        jumbotron.querySelector<HTMLElement>(`[${OPEN_ALL_MARKER_ATTR}]`);
    if (!anchorButton) {
        return;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-xs btn-danger';
    button.textContent = CLAIM_ALL_BUTTON_LABEL;
    button.setAttribute(CLAIM_ALL_MARKER_ATTR, '1');
    button.title = `Забрать ${sessions.length} сессий себе`;
    button.disabled = sessions.length === 0;
    button.style.marginLeft = '6px';

    button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();

        if (!confirm(`Забрать все ${sessions.length} сессий себе?`)) {
            return;
        }

        void (async () => {
            button.disabled = true;
            try {
                for (const session of sessions) {
                    await claimSession(session.url);
                }
                location.reload();
            } catch {
                alert('Не удалось забрать одну или несколько сессий.');
                button.disabled = false;
            }
        })();
    });

    anchorButton.insertAdjacentElement('afterend', button);
}

export function ensureAnonymousSessionActions(sessions: SessionRow[]): void {
    if (!isAnonymousSessionsPage()) {
        return;
    }

    for (const session of sessions) {
        const link = session.row.querySelector<HTMLAnchorElement>('td a[href^="/rs/"]');
        if (!link || link.parentElement?.querySelector(`[${ANON_ACTIONS_MARKER_ATTR}]`)) {
            continue;
        }

        const actions = document.createElement('div');
        actions.setAttribute(ANON_ACTIONS_MARKER_ATTR, '1');
        actions.style.marginTop = '4px';

        const joinLink = document.createElement('a');
        joinLink.href = buildSessionActionUrl(session.url, 'join');
        joinLink.className = 'btn btn-xs btn-danger';
        joinLink.textContent = 'Забрать сессиию себе';

        const deleteLink = document.createElement('a');
        deleteLink.href = buildSessionActionUrl(session.url, 'delete');
        deleteLink.className = 'btn btn-xs btn-danger';
        deleteLink.textContent = '⚠️Удалить !!!';
        deleteLink.style.marginLeft = '4px';

        actions.append(joinLink, deleteLink);
        link.insertAdjacentElement('afterend', actions);
    }
}
