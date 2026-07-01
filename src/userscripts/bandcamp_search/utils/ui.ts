import { buildSearchGroups } from './buttons.ts';
import type { Release } from './types.ts';

const CONTAINER_ID = 'bc_tracker_search';

export function insertButton(release: Release): void {
    // don't insert on non-release pages
    const anchor: HTMLElement | null = document.querySelector('div.trackView');
    if (!anchor) {
        return;
    }

    // if the our UI already exists, return early
    if (document.getElementById(CONTAINER_ID)) {
        return;
    }

    // Prepare our UI element
    const wrapper = document.createElement('div');
    wrapper.id = CONTAINER_ID;
    wrapper.style.marginBlock = '24px';

    const header = document.createElement('div');
    header.textContent = 'Search';
    Object.assign(header.style, {
        fontSize: '16px',
        fontWeight: 'bold',
        marginBottom: '6px',
    });
    wrapper.appendChild(header);
    wrapper.appendChild(buildSearchGroups(release));

    // Insert it
    anchor.insertAdjacentElement('beforebegin', wrapper);
}
