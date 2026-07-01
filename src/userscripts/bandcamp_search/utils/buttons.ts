import { GROUPS, TRACKERS } from './trackers.ts';
import type { Release, SearchGroup, Tracker } from './types.ts';

function applyButtonStyle(element: HTMLElement, tracker: Tracker): void {
    Object.assign(element.style, {
        display: 'inline-block',
        marginRight: '6px',
        padding: '3px 8px',
        border: `1px solid ${tracker.color}`,
        borderRadius: '3px',
        background: tracker.color,
        color: '#fff',
        fontSize: '11px',
        fontWeight: 'bold',
        textDecoration: 'none',
        lineHeight: 'normal',
        fontFamily: 'inherit',
        cursor: 'pointer',
        transition: 'background 0.15s ease, border-color 0.15s ease',
    });
    element.addEventListener('mouseenter', () => {
        element.style.background = tracker.hoverColor;
        element.style.borderColor = tracker.hoverColor;
    });
    element.addEventListener('mouseleave', () => {
        element.style.background = tracker.color;
        element.style.borderColor = tracker.color;
    });
}

function setButtonContent(element: HTMLElement, tracker: Tracker): void {
    if (tracker.icon) {
        const img = document.createElement('img');
        img.src = tracker.icon;
        img.alt = '';
        Object.assign(img.style, {
            width: '14px',
            height: '14px',
            marginRight: '5px',
            verticalAlign: 'middle',
        });
        element.appendChild(img);
    }
    const label = document.createElement('span');
    label.textContent = tracker.label;
    label.style.verticalAlign = 'middle';
    element.appendChild(label);
}

function buildButton(tracker: Tracker, query: string, idSuffix: string): HTMLElement {
    const titleText = `Search "${query}" on ${tracker.name} (opens in a new tab)`;

    if (tracker.method === 'post') {
        const form = document.createElement('form');
        form.id = `${tracker.id}_${idSuffix}`;
        form.method = 'post';
        form.action = tracker.action;
        form.target = '_blank';
        form.style.display = 'inline-block';
        form.style.margin = '0';
        if (tracker.acceptCharset) {
            form.acceptCharset = tracker.acceptCharset;
        }

        const fields = tracker.fields(query);
        for (const [fieldName, fieldValue] of Object.entries(fields)) {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = fieldName;
            input.value = fieldValue;
            form.appendChild(input);
        }

        const button = document.createElement('button');
        button.type = 'submit';
        button.title = titleText;
        applyButtonStyle(button, tracker);
        setButtonContent(button, tracker);
        form.appendChild(button);
        return form;
    }

    const link = document.createElement('a');
    link.id = `${tracker.id}_${idSuffix}`;
    link.href = tracker.buildUrl(query, idSuffix);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.title = titleText;
    applyButtonStyle(link, tracker);
    setButtonContent(link, tracker);
    return link;
}

function buildGroup(group: SearchGroup, release: Release): HTMLDivElement {
    const container = document.createElement('div');
    Object.assign(container.style, {
        border: '1px solid rgba(0, 0, 0, 0.15)',
        borderRadius: '4px',
        padding: '6px 8px',
    });

    const caption = document.createElement('div');
    caption.textContent = group.caption;
    Object.assign(caption.style, {
        fontSize: '10px',
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        opacity: '0.6',
        marginBottom: '5px',
    });
    container.appendChild(caption);

    const query = group.buildQuery(release);
    for (const tracker of TRACKERS) {
        container.appendChild(buildButton(tracker, query, group.idSuffix));
    }
    return container;
}

export function buildSearchGroups(release: Release): HTMLDivElement {
    const groupsRow = document.createElement('div');
    Object.assign(groupsRow.style, {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px',
        alignItems: 'flex-start',
    });
    for (const group of GROUPS) {
        groupsRow.appendChild(buildGroup(group, release));
    }
    return groupsRow;
}
