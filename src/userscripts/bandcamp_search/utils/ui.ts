import { buildSearchGroups } from './buttons.ts';
import type { Release } from './types.ts';

const CONTAINER_ID = 'bc_tracker_search';

export function insertButton(release: Release): void {
    const anchor = document.querySelector('div#customHeaderWrapper');
    if (!anchor) {
        return;
    }
    if (document.getElementById(CONTAINER_ID)) {
        return;
    }

    const wrapper = document.createElement('div');
    wrapper.id = CONTAINER_ID;
    wrapper.style.margin = '6px 0';

    const header = document.createElement('div');
    header.textContent = 'Search';
    Object.assign(header.style, {
        fontSize: '16px',
        fontWeight: 'bold',
        marginBottom: '6px',
    });
    wrapper.appendChild(header);
    wrapper.appendChild(buildSearchGroups(release));

    anchor.insertAdjacentElement('afterend', wrapper);
}
