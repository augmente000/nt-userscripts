import { clearCachedPreviews, getCachedPreviews, setCachedPreviews } from './cache.ts';
import { fetchSessionPreviews, sleep } from './fetcher.ts';
import type { SessionRow } from './types.ts';
import { renderErrorState, renderLoadingState, renderPreviews } from './ui.ts';

const FETCH_INTERVAL_MS = 1000;

export class PreviewFetchQueue {
    private readonly pending: SessionRow[] = [];
    private processing = false;

    enqueue(session: SessionRow): void {
        this.pending.push(session);
        void this.process();
    }

    refresh(session: SessionRow): void {
        clearCachedPreviews(session.sessionId);
        renderLoadingState(session.row);
        this.enqueue(session);
    }

    private async process(): Promise<void> {
        if (this.processing) {
            return;
        }

        this.processing = true;

        while (this.pending.length > 0) {
            const session = this.pending.shift()!;
            void this.fetchAndRender(session);

            if (this.pending.length > 0) {
                await sleep(FETCH_INTERVAL_MS);
            }
        }

        this.processing = false;
    }

    private async fetchAndRender(session: SessionRow): Promise<void> {
        try {
            const previewHtml = await fetchSessionPreviews(session.url);
            setCachedPreviews(session.sessionId, previewHtml);
            renderPreviews(session.row, previewHtml, () => {
                this.refresh(session);
            });
        } catch {
            renderErrorState(session.row, () => {
                this.refresh(session);
            });
        }
    }
}

export function loadCachedOrQueue(session: SessionRow, queue: PreviewFetchQueue): void {
    const cached = getCachedPreviews(session.sessionId);
    if (cached !== null) {
        renderPreviews(session.row, cached, () => {
            queue.refresh(session);
        });
        return;
    }

    renderLoadingState(session.row);
    queue.enqueue(session);
}
