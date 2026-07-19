import { classifyRelease, detectPage, discoverReleases, fetchRelease, parseReleaseDocument } from './utils/bandcamp.ts';
import { downloadRelease } from './utils/downloader.ts';
import { GuerrillaInbox } from './utils/guerrilla-mail.ts';
import { ProgressUi, progressUiExists } from './utils/progress-ui.ts';
import type { ProgressSnapshot, ReleaseInfo, ReleaseTask } from './utils/types.ts';

const MAX_ACTIVE_DOWNLOADS = 3;

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

async function runQueue(
    tasks: ReleaseTask[],
    ui: ProgressUi,
    currentRelease: ReleaseInfo | null,
    signal: AbortSignal,
): Promise<void> {
    const inbox = new GuerrillaInbox(signal);
    const itemProgress = new Map<number, number>();
    const statuses = new Map<number, string>();
    const snapshot: ProgressSnapshot = {
        active: 0,
        completed: 0,
        current: [],
        failed: 0,
        progress: 0,
        queued: tasks.length,
        skipped: 0,
        total: tasks.length,
    };
    let nextIndex = 0;

    const render = (): void => {
        snapshot.current = [...statuses.values()];
        const processed = snapshot.completed + snapshot.skipped + snapshot.failed;
        const inProgress = [...itemProgress.values()].reduce((sum, progress) => sum + progress, 0);
        snapshot.progress = snapshot.total === 0 ? 1 : (processed + inProgress) / snapshot.total;
        ui.update(snapshot);
    };

    const worker = async (): Promise<void> => {
        while (!signal.aborted && nextIndex < tasks.length) {
            const index = nextIndex;
            nextIndex += 1;
            const task = tasks[index];
            if (!task) {
                continue;
            }

            snapshot.queued -= 1;
            snapshot.active += 1;
            itemProgress.set(index, 0);
            statuses.set(index, `${task.title}: loading release page`);
            render();

            try {
                const release =
                    currentRelease && tasks.length === 1 && task.url === currentRelease.url
                        ? currentRelease
                        : await fetchRelease(task.url, signal);
                const report = (message: string, progress?: number): void => {
                    statuses.set(index, `${release.title}: ${message}`);
                    if (progress !== undefined) {
                        itemProgress.set(index, Math.min(0.99, Math.max(0, progress)));
                    }
                    render();
                };
                const result = await downloadRelease(release, inbox, report, signal);
                if (result.outcome === 'completed') {
                    snapshot.completed += 1;
                } else {
                    snapshot.skipped += 1;
                }
                statuses.set(index, `${release.title}: ${result.detail}`);
            } catch (error) {
                if (signal.aborted) {
                    statuses.set(index, `${task.title}: stopped`);
                } else {
                    snapshot.failed += 1;
                    statuses.set(index, `${task.title}: ${errorMessage(error)}`);
                    console.error('[Bandcamp Collection Downloader]', task.url, error);
                }
            } finally {
                snapshot.active -= 1;
                itemProgress.delete(index);
                render();
                window.setTimeout(() => {
                    statuses.delete(index);
                    if (snapshot.active > 0 || snapshot.queued > 0) {
                        render();
                    }
                }, 2_500);
            }
        }
    };

    await Promise.all(Array.from({ length: Math.min(MAX_ACTIVE_DOWNLOADS, tasks.length) }, () => worker()));
    statuses.clear();
    snapshot.current = [];
    if (signal.aborted) {
        snapshot.queued = 0;
        ui.cancel(snapshot);
    } else {
        snapshot.progress = 1;
        ui.finish(snapshot);
    }
}

function main(): void {
    if (progressUiExists()) {
        return;
    }

    const pageKind = detectPage();
    if (pageKind === 'unsupported') {
        return;
    }

    let tasks: ReleaseTask[];
    let currentRelease: ReleaseInfo | null = null;
    if (pageKind === 'discography') {
        tasks = discoverReleases(document, window.location.href);
    } else {
        try {
            currentRelease = parseReleaseDocument(document, window.location.href);
            tasks = [{ title: currentRelease.title, url: window.location.href }];
        } catch (error) {
            console.error('[Bandcamp Collection Downloader] Could not initialize page', error);
            return;
        }
    }

    let controller: AbortController | null = null;
    const unavailable = currentRelease !== null && classifyRelease(currentRelease) === 'unavailable';
    let ui: ProgressUi;
    ui = new ProgressUi(
        pageKind === 'discography' ? 'Download All' : 'Download',
        pageKind === 'discography',
        () => {
            controller = new AbortController();
            ui.start(tasks.length);
            void runQueue(tasks, ui, currentRelease, controller.signal);
        },
        () => controller?.abort(),
    );
    if (unavailable) {
        ui.unavailable("This paid release isn't available in your Bandcamp collection.");
    }
}

main();
