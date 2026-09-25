import { CollectionChecker } from './shared/checker';
import { CmsClient } from './shared/cms';
import type { SiteAdapter } from './shared/types';
import { installCollectionMarkerStyles } from './shared/ui';
import { bandcodesAdapter } from './sites/bandcodes';

const SITE_ADAPTERS: SiteAdapter[] = [bandcodesAdapter];

function main(): void {
    const currentUrl = new URL(window.location.href);
    const adapter = SITE_ADAPTERS.find(candidate => candidate.matches(currentUrl));
    if (!adapter) {
        return;
    }

    installCollectionMarkerStyles();

    const cmsClient = new CmsClient();
    const checker = new CollectionChecker(adapter, cmsClient);

    GM_registerMenuCommand('Edit CMS API token', () => {
        if (!cmsClient.configureToken()) {
            return;
        }

        checker.reset();
    });

    checker.start();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main, { once: true });
} else {
    main();
}
