import { initDuplicateReleaseGroupsToggle } from './features/duplicate-release-groups';
import { initGuessCaseBracketNormalization } from './features/guess-case-brackets';
import { initMilieuMusicAutofill } from './features/milieu-music';

function isReleaseAddPage(): boolean {
    return window.location.pathname === '/release/add';
}

function init(): void {
    if (!isReleaseAddPage()) {
        return;
    }

    initMilieuMusicAutofill();
    initDuplicateReleaseGroupsToggle();
    initGuessCaseBracketNormalization();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
    init();
}
