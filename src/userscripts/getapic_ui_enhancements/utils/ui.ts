import type { SessionRow } from './types.ts';

const PREVIEW_CELL_CLASS = 'nt-getapic-preview-cell';
const PREVIEW_CONTAINER_CLASS = 'nt-getapic-previews';
const MARKER_ATTR = 'data-nt-getapic-previews';

const OPEN_ALL_MARKER_ATTR = 'data-nt-getapic-open-all';
const JUMBOTRON_SELECTOR = '.jumbotron.medium-height.align-left';
const ANON_BUTTON_SELECTOR = 'a.btn.btn-xs.btn-primary';
const OPEN_ALL_BUTTON_LABEL = 'Открыть все сессии';

export function ensurePreviewColumn(table: HTMLTableElement): void {
    if (table.querySelector(`.${PREVIEW_CELL_CLASS}`)) {
        return;
    }

    const headerRow = table.querySelector('thead tr');
    if (headerRow) {
        const header = document.createElement('th');
        header.textContent = 'Превью';
        headerRow.appendChild(header);
    }
}

function getOrCreatePreviewCell(row: HTMLTableRowElement): HTMLTableCellElement {
    let cell = row.querySelector<HTMLTableCellElement>(`.${PREVIEW_CELL_CLASS}`);
    if (cell) {
        return cell;
    }

    cell = document.createElement('td');
    cell.className = PREVIEW_CELL_CLASS;
    row.appendChild(cell);
    return cell;
}

function createRefreshButton(onRefresh: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '↻';
    button.title = 'Обновить превью';
    Object.assign(button.style, {
        marginLeft: '6px',
        padding: '0 4px',
        fontSize: '12px',
        lineHeight: '1.2',
        cursor: 'pointer',
        verticalAlign: 'middle',
    });
    button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        onRefresh();
    });
    return button;
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

export function renderErrorState(row: HTMLTableRowElement, onRefresh: () => void): void {
    const cell = getOrCreatePreviewCell(row);
    cell.replaceChildren();

    const label = document.createElement('span');
    label.textContent = 'ошибка';
    label.style.color = '#c00';
    label.style.fontSize = '12px';
    cell.append(label, createRefreshButton(onRefresh));
}

export function renderPreviews(row: HTMLTableRowElement, previewHtml: string, onRefresh: () => void): void {
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

    container.appendChild(createRefreshButton(onRefresh));
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
