const CONTROL_ROW_CLASS = 'nt-duplicate-release-groups-control';
const DUPLICATE_LIST_SELECTOR = '.duplicate-release-groups-list';
const DUPLICATE_ROW_ID = 'nt-duplicate-release-groups';

function addStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
        .${CONTROL_ROW_CLASS} {
            height: 24px;
        }

        .${CONTROL_ROW_CLASS} > td {
            box-sizing: border-box;
            height: 24px;
            padding-bottom: 2px !important;
            padding-top: 2px !important;
        }

        .${CONTROL_ROW_CLASS} button {
            box-sizing: border-box;
            font-size: 11px;
            height: 20px;
            line-height: 18px;
            padding: 0 6px;
            vertical-align: top;
            white-space: nowrap;
            width: 190px;
        }

        .${CONTROL_ROW_CLASS} button.nt-has-duplicates {
            background-color: #fff2cc;
            border-color: #e59b18;
            box-shadow: 0 0 5px rgb(229 155 24 / 65%);
            color: #704500;
        }

        .${CONTROL_ROW_CLASS} button.nt-has-duplicates:hover,
        .${CONTROL_ROW_CLASS} button.nt-has-duplicates:focus-visible {
            background-color: #ffe7a3;
            border-color: #c77d00;
            box-shadow: 0 0 7px rgb(229 155 24 / 80%);
        }
    `;
    document.head.append(style);
}

function updateButton(button: HTMLButtonElement, hidden: boolean, duplicateCount: number): void {
    const hasDuplicates = duplicateCount > 0;
    button.disabled = !hasDuplicates;
    button.classList.toggle('nt-has-duplicates', hasDuplicates);
    button.setAttribute('aria-expanded', String(hasDuplicates && !hidden));
    const action = !hasDuplicates || hidden ? 'Show' : 'Hide';
    const count = hasDuplicates ? ` (${duplicateCount})` : '';
    const text = `${action} similar release groups${count}`;
    if (button.textContent !== text) {
        button.textContent = text;
    }
}

function createControlRow(onToggle: () => void): HTMLTableRowElement {
    const controlRow = document.createElement('tr');
    controlRow.className = CONTROL_ROW_CLASS;

    const spacerCell = document.createElement('td');
    const controlCell = document.createElement('td');
    controlCell.colSpan = 2;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'styled-button';
    button.disabled = true;
    button.textContent = 'Show similar release groups';
    button.setAttribute('aria-controls', DUPLICATE_ROW_ID);
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', onToggle);

    controlCell.append(button);
    controlRow.append(spacerCell, controlCell);
    return controlRow;
}

function findDuplicateRow(): HTMLTableRowElement | undefined {
    return document.querySelector(DUPLICATE_LIST_SELECTOR)?.closest<HTMLTableRowElement>('tr') ?? undefined;
}

function countDuplicates(row: HTMLTableRowElement | undefined): number {
    return row?.querySelectorAll(`${DUPLICATE_LIST_SELECTOR} > label:not(:last-child)`).length ?? 0;
}

export function initDuplicateReleaseGroupsToggle(): void {
    let controlRow: HTMLTableRowElement | undefined;
    let duplicatesHidden = true;

    const update = (): void => {
        if (!controlRow?.isConnected) {
            const releaseGroupRow = document.querySelector<HTMLInputElement>('#release-group')?.closest('tr');
            if (!releaseGroupRow) {
                return;
            }

            controlRow = createControlRow(() => {
                duplicatesHidden = !duplicatesHidden;
                update();
            });
            releaseGroupRow.after(controlRow);
        }

        const duplicateRow = findDuplicateRow();
        if (duplicateRow) {
            duplicateRow.id = DUPLICATE_ROW_ID;
            duplicateRow.hidden = duplicatesHidden;
        }

        const loadingRow = document
            .querySelector('.duplicate-release-groups-loading')
            ?.closest<HTMLTableRowElement>('tr');
        if (loadingRow) {
            loadingRow.hidden = true;
        }

        const button = controlRow.querySelector<HTMLButtonElement>('button');
        if (button) {
            updateButton(button, duplicatesHidden, countDuplicates(duplicateRow));
        }
    };

    let updatePending = false;
    const scheduleUpdate = (): void => {
        if (updatePending) {
            return;
        }

        updatePending = true;
        queueMicrotask(() => {
            updatePending = false;
            update();
        });
    };

    addStyles();
    update();
    new MutationObserver(scheduleUpdate).observe(document.body, {
        childList: true,
        subtree: true,
    });
}
