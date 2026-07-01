import { getReleaseData } from './utils/release.ts';
import { insertButton } from './utils/ui.ts';

function init(): void {
    const release = getReleaseData();
    if (!release) {
        return;
    }
    insertButton(release);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
