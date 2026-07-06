import { extractSessionsFromTable } from './utils/parser.ts';
import { loadCachedOrQueue, PreviewFetchQueue } from './utils/queue.ts';
import {
    ensureAnonymousSessionActions,
    ensureClaimAllSessionsButton,
    ensureOpenAllSessionsButton,
    ensurePreviewColumn,
    ensureRefreshAllPreviewsButton,
    isRowProcessed,
    markRowProcessed,
} from './utils/ui.ts';

const TABLE_SELECTOR = 'table.table.table-striped.table-bordered.table-hover.table-condensed';

function init(): void {
    const table = document.querySelector<HTMLTableElement>(TABLE_SELECTOR);
    if (!table) {
        return;
    }

    ensurePreviewColumn(table);

    const sessions = extractSessionsFromTable(table);
    ensureOpenAllSessionsButton(sessions);
    ensureAnonymousSessionActions(sessions);

    const queue = new PreviewFetchQueue();
    ensureRefreshAllPreviewsButton(() => {
        queue.refreshAll(sessions);
    });
    ensureClaimAllSessionsButton(sessions);

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
