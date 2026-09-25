import { ApiAuthenticationError, CmsClient } from './cms';
import { TaskQueue } from './task-queue';
import type { CmsRelease, SiteAdapter, SiteRelease } from './types';
import { clearCollectionMarkers, markReleaseInCollection } from './ui';

const MAX_CONCURRENT_CHECKS = 4;
const SCAN_DELAY_MS = 100;

export class CollectionChecker {
    private authenticationWarningShown = false;
    private generation = 0;
    private readonly lookupTasks = new Map<string, Promise<CmsRelease | null>>();
    private processedElements = new WeakSet<HTMLElement>();
    private scanScheduled = false;
    private readonly taskQueue = new TaskQueue(MAX_CONCURRENT_CHECKS);

    constructor(
        private readonly adapter: SiteAdapter,
        private readonly cmsClient: CmsClient,
    ) {}

    reset(): void {
        this.generation += 1;
        this.lookupTasks.clear();
        this.processedElements = new WeakSet<HTMLElement>();
        this.authenticationWarningShown = false;
        clearCollectionMarkers();
        this.scan();
    }

    start(): void {
        const observer = new MutationObserver(() => this.scheduleScan());
        observer.observe(document.body, { childList: true, subtree: true });
        this.scan();
    }

    private checkRelease(release: SiteRelease): void {
        this.processedElements.add(release.element);
        const checkGeneration = this.generation;

        void this.getLookup(release)
            .then(cmsRelease => {
                if (!cmsRelease || checkGeneration !== this.generation || !release.element.isConnected) {
                    return;
                }

                markReleaseInCollection(release.element, this.cmsClient.getEditUrl(cmsRelease));
            })
            .catch((error: unknown) => {
                if (checkGeneration !== this.generation) {
                    return;
                }

                console.error(`Release Collection Checker: failed to check ${release.key}`, error);

                if (error instanceof ApiAuthenticationError && !this.authenticationWarningShown) {
                    this.authenticationWarningShown = true;
                    window.alert('The CMS API rejected the saved token. Use the userscript menu to update it.');
                }
            });
    }

    private getLookup(release: SiteRelease): Promise<CmsRelease | null> {
        const existingTask = this.lookupTasks.get(release.key);
        if (existingTask) {
            return existingTask;
        }

        const task = this.taskQueue.run(async () => {
            const externalUrl = await release.getExternalUrl();
            if (!externalUrl) {
                console.warn(`Release Collection Checker: no external release URL found for ${release.key}`);
                return null;
            }

            return this.cmsClient.findRelease(externalUrl);
        });
        this.lookupTasks.set(release.key, task);
        return task;
    }

    private scan(): void {
        for (const release of this.adapter.findReleases(document)) {
            if (!this.processedElements.has(release.element)) {
                this.checkRelease(release);
            }
        }
    }

    private scheduleScan(): void {
        if (this.scanScheduled) {
            return;
        }

        this.scanScheduled = true;
        window.setTimeout(() => {
            this.scanScheduled = false;
            this.scan();
        }, SCAN_DELAY_MS);
    }
}
