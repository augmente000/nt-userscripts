import {
    ACTION_BUTTON_CLASS,
    CONTROLS_CLASS,
    GRID_SELECTOR,
    ITEM_SELECTOR,
    PRUNED_CLASS,
    SHOW_HIDDEN_CLASS,
    TOGGLE_CLASS,
    addStyles,
} from './styles.ts';

const STORAGE_KEY = `nt-discography-pruner:hidden:${location.hostname}`;

function loadHiddenIds(): Set<string> {
    try {
        const storedValue = localStorage.getItem(STORAGE_KEY);
        if (!storedValue) {
            return new Set();
        }

        const parsedValue: unknown = JSON.parse(storedValue);
        if (!Array.isArray(parsedValue)) {
            return new Set();
        }

        return new Set(parsedValue.filter(value => typeof value === 'string'));
    } catch {
        return new Set();
    }
}

function saveHiddenIds(hiddenIds: Set<string>): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...hiddenIds]));
    } catch {
        // Pruning still works for the current page if storage is unavailable.
    }
}

function getItemId(item: HTMLElement): string | undefined {
    return item.dataset['itemId'];
}

function getItemName(item: HTMLElement): string {
    const title = item.querySelector<HTMLElement>('.title');
    if (!title) {
        return 'this release';
    }

    for (const node of title.childNodes) {
        const name = node.nodeType === Node.TEXT_NODE ? node.textContent?.trim() : undefined;
        if (name) {
            return name;
        }
    }

    return 'this release';
}

function createActionButton(item: HTMLElement, action: 'prune' | 'restore', onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    const itemName = getItemName(item);
    const isRestore = action === 'restore';
    const actionLabel = isRestore ? `Restore ${itemName}` : `Hide ${itemName}`;

    button.type = 'button';
    button.className = ACTION_BUTTON_CLASS;
    button.dataset['action'] = action;
    button.title = actionLabel;
    button.setAttribute('aria-label', actionLabel);
    button.innerHTML = isRestore
        ? `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M7.4 7H16a5 5 0 0 1 0 10h-5v-2h5a3 3 0 0 0 0-6H7.4l3.3 3.3-1.4 1.4L3.6 8l5.7-5.7 1.4 1.4L7.4 7Z"/>
            </svg>
        `
        : `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h10l-1 12H8L7 9Zm3 2v7h2v-7h-2Zm4 0v7h2v-7h-2Z"/>
            </svg>
        `;

    button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
    });

    return button;
}

function getHiddenItemCount(items: HTMLElement[], hiddenIds: Set<string>): number {
    return items.filter(item => {
        const itemId = getItemId(item);
        return itemId !== undefined && hiddenIds.has(itemId);
    }).length;
}

function formatHiddenButtonLabel(isShowing: boolean, count: number): string {
    const action = isShowing ? 'Collapse' : 'Show';
    const noun = count === 1 ? 'Item' : 'Items';
    return `${action} ${count} Hidden ${noun}`;
}

function init(): void {
    const grid = document.querySelector<HTMLOListElement>(GRID_SELECTOR);
    if (!grid) {
        return;
    }
    const musicGrid = grid;

    addStyles();

    const items = [...document.querySelectorAll<HTMLElement>(ITEM_SELECTOR)];
    const hiddenIds = loadHiddenIds();
    const controls = document.createElement('div');
    const pruneToggle = document.createElement('button');
    const hiddenToggle = document.createElement('button');
    let isPruneEnabled = false;
    let isShowingHidden = false;

    controls.className = CONTROLS_CLASS;

    pruneToggle.type = 'button';
    pruneToggle.className = TOGGLE_CLASS;
    pruneToggle.textContent = 'Enable Prune';
    pruneToggle.setAttribute('aria-controls', 'music-grid');
    pruneToggle.setAttribute('aria-pressed', 'false');

    hiddenToggle.type = 'button';
    hiddenToggle.className = TOGGLE_CLASS;
    hiddenToggle.setAttribute('aria-controls', 'music-grid');
    hiddenToggle.setAttribute('aria-pressed', 'false');

    function render(): void {
        for (const item of items) {
            item.querySelector(`:scope > .${ACTION_BUTTON_CLASS}`)?.remove();

            const itemId = getItemId(item);
            const isHidden = itemId !== undefined && hiddenIds.has(itemId);
            item.classList.toggle(PRUNED_CLASS, isHidden);

            if (isHidden && isShowingHidden) {
                item.append(
                    createActionButton(item, 'restore', () => {
                        if (itemId !== undefined) {
                            hiddenIds.delete(itemId);
                            saveHiddenIds(hiddenIds);
                            render();
                        }
                    }),
                );
            } else if (!isHidden && isPruneEnabled && itemId !== undefined) {
                item.append(
                    createActionButton(item, 'prune', () => {
                        hiddenIds.add(itemId);
                        saveHiddenIds(hiddenIds);
                        render();
                    }),
                );
            }
        }

        const hiddenCount = getHiddenItemCount(items, hiddenIds);
        if (hiddenCount === 0) {
            isShowingHidden = false;
        }

        musicGrid.classList.toggle(SHOW_HIDDEN_CLASS, isShowingHidden);
        hiddenToggle.textContent = formatHiddenButtonLabel(isShowingHidden, hiddenCount);
        hiddenToggle.disabled = hiddenCount === 0;
        hiddenToggle.setAttribute('aria-pressed', String(isShowingHidden));
    }

    pruneToggle.addEventListener('click', () => {
        isPruneEnabled = !isPruneEnabled;
        pruneToggle.textContent = isPruneEnabled ? 'Disable Prune' : 'Enable Prune';
        pruneToggle.setAttribute('aria-pressed', String(isPruneEnabled));
        render();
    });

    hiddenToggle.addEventListener('click', () => {
        isShowingHidden = !isShowingHidden;
        render();
    });

    controls.append(pruneToggle, hiddenToggle);
    musicGrid.before(controls);
    render();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
    init();
}
