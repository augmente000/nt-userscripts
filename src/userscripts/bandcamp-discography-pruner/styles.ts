export const GRID_SELECTOR = '#music-grid';
export const ITEM_SELECTOR = `${GRID_SELECTOR} > li.music-grid-item`;
export const ACTION_BUTTON_CLASS = 'nt-discography-pruner-action';
export const CONTROLS_CLASS = 'nt-discography-pruner-controls';
export const TOGGLE_CLASS = 'nt-discography-pruner-toggle';
export const PRUNED_CLASS = 'nt-discography-pruner-hidden';
export const SHOW_HIDDEN_CLASS = 'nt-discography-pruner-show-hidden';

const STYLE_ID = 'nt-discography-pruner-styles';

const CSS = `
    ${ITEM_SELECTOR} {
        position: relative;
    }

    ${ITEM_SELECTOR}.${PRUNED_CLASS} {
        display: none !important;
    }

    ${GRID_SELECTOR}.${SHOW_HIDDEN_CLASS} > li.music-grid-item.${PRUNED_CLASS} {
        display: inline-block !important;
        opacity: 0.72;
        filter: grayscale(75%);
    }

    ${GRID_SELECTOR}.${SHOW_HIDDEN_CLASS} > li.music-grid-item.${PRUNED_CLASS}::after {
        position: absolute;
        z-index: 1;
        inset: 0;
        border: 2px dashed rgb(175 45 45 / 80%);
        content: "";
        pointer-events: none;
    }

    .${CONTROLS_CLASS} {
        display: flex;
        gap: 7px;
        align-items: center;
        margin: 0 0 14px;
    }

    .${TOGGLE_CLASS} {
        padding: 5px 9px;
        color: #333;
        font: 600 12px/1.2 Arial, sans-serif;
        background: #fff;
        border: 1px solid rgb(0 0 0 / 25%);
        border-radius: 3px;
        box-shadow: 0 1px 2px rgb(0 0 0 / 10%);
        cursor: pointer;
    }

    .${TOGGLE_CLASS}:hover:not(:disabled) {
        border-color: rgb(0 0 0 / 50%);
    }

    .${TOGGLE_CLASS}[aria-pressed="true"] {
        color: #fff;
        background: #555;
        border-color: #555;
    }

    .${TOGGLE_CLASS}:disabled {
        cursor: default;
        opacity: 0.5;
    }

    .${TOGGLE_CLASS}:focus-visible,
    .${ACTION_BUTTON_CLASS}:focus-visible {
        outline: 2px solid currentColor;
        outline-offset: 2px;
    }

    .${ACTION_BUTTON_CLASS} {
        position: absolute;
        z-index: 2;
        top: 6px;
        right: 6px;
        display: grid;
        width: 24px;
        height: 24px;
        padding: 0;
        place-items: center;
        color: #fff;
        background: rgb(0 0 0 / 68%);
        border: 0;
        border-radius: 4px;
        box-shadow: 0 1px 4px rgb(0 0 0 / 35%);
        cursor: pointer;
        opacity: 0.72;
    }

    .${ACTION_BUTTON_CLASS}:hover {
        background: #c33;
        opacity: 1;
    }

    .${ACTION_BUTTON_CLASS}[data-action="restore"] {
        color: #222;
        background: #fff;
        opacity: 1;
    }

    .${ACTION_BUTTON_CLASS}[data-action="restore"]:hover {
        color: #fff;
        background: #278247;
    }

    .${ACTION_BUTTON_CLASS} svg {
        width: 14px;
        height: 14px;
        pointer-events: none;
    }
`;

export function addStyles(): void {
    if (document.getElementById(STYLE_ID)) {
        return;
    }

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.append(style);
}
