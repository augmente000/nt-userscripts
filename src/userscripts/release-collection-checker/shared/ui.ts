const MATCH_CLASS = 'release-collection-checker-match';
const MARKER_CLASS = 'release-collection-checker-marker';

export function markReleaseInCollection(element: HTMLElement, editUrl: string): void {
    if (element.querySelector(`.${MARKER_CLASS}`)) {
        return;
    }

    element.classList.add(MATCH_CLASS);

    const marker = document.createElement('a');
    marker.className = MARKER_CLASS;
    marker.href = editUrl;
    marker.target = '_blank';
    marker.rel = 'noopener noreferrer';
    marker.title = 'Open this release in the CMS';
    marker.setAttribute('aria-label', 'Already in your collection. Open this release in the CMS.');
    marker.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.25 4.25L19 7" /></svg>';
    element.append(marker);
}

export function clearCollectionMarkers(): void {
    for (const element of document.querySelectorAll<HTMLElement>(`.${MATCH_CLASS}`)) {
        element.classList.remove(MATCH_CLASS);
    }

    for (const marker of document.querySelectorAll(`.${MARKER_CLASS}`)) {
        marker.remove();
    }
}

export function installCollectionMarkerStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
        .${MATCH_CLASS} {
            outline: 2px solid #16a34a !important;
            outline-offset: -2px;
        }

        .${MARKER_CLASS} {
            align-items: center;
            background: #16a34a;
            border: 2px solid white;
            border-radius: 9999px;
            box-shadow: 0 1px 5px rgb(0 0 0 / 45%);
            color: white;
            display: flex;
            height: 2rem;
            justify-content: center;
            position: absolute;
            right: 0.5rem;
            top: 0.5rem;
            width: 2rem;
            z-index: 20;
        }

        .${MARKER_CLASS}:hover {
            background: #15803d;
            transform: scale(1.08);
        }

        .${MARKER_CLASS}:focus-visible {
            outline: 3px solid white;
            outline-offset: 2px;
        }

        .${MARKER_CLASS} svg {
            fill: none;
            height: 1.25rem;
            stroke: currentColor;
            stroke-linecap: round;
            stroke-linejoin: round;
            stroke-width: 3;
            width: 1.25rem;
        }
    `;
    document.head.append(style);
}
