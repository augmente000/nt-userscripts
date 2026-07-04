import { extractSessionsFromTable } from './utils/parser.ts';
import { loadCachedOrQueue, PreviewFetchQueue } from './utils/queue.ts';
import { ensureOpenAllSessionsButton, ensurePreviewColumn, isRowProcessed, markRowProcessed } from './utils/ui.ts';

const TABLE_SELECTOR = 'table.table.table-striped.table-bordered.table-hover.table-condensed';

function init(): void {
    const table = document.querySelector<HTMLTableElement>(TABLE_SELECTOR);
    if (!table) {
        return;
    }

    ensurePreviewColumn(table);

    const sessions = extractSessionsFromTable(table);
    ensureOpenAllSessionsButton(sessions);

    const queue = new PreviewFetchQueue();

    for (const session of sessions) {
        if (isRowProcessed(session.row)) {
            continue;
        }

        markRowProcessed(session.row);
        loadCachedOrQueue(session, queue);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
