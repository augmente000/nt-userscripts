import { setInputValue } from '../utils/input';

const CATALOG_NUMBER_PATTERN = /\bMilieu\s+Music\s+number\s+([^\s,.;:!?()[\]{}]+)/iu;
const LABEL_MBID = '51e69c25-113c-4052-b430-837f9eebb3ac';
const MILIEU_MUSIC_PATTERN = /\bMilieu\s+Music\b/iu;
const POLL_INTERVAL_MS = 500;

interface AddedLabel {
    catalogNumberInput: HTMLInputElement;
    row: HTMLTableRowElement;
}

function annotationText(): string | undefined {
    return document.querySelector<HTMLTextAreaElement>('#annotation')?.value;
}

function extractCatalogNumber(annotation: string): string | undefined {
    return CATALOG_NUMBER_PATTERN.exec(annotation)?.[1];
}

function findEmptyLabel(): AddedLabel | undefined {
    const labelInput = document.querySelector<HTMLInputElement>('input[id^="label-"]');
    if (!labelInput || labelInput.value.trim()) {
        return undefined;
    }

    const row = labelInput.closest<HTMLTableRowElement>('tr');
    const catalogNumberInput = row?.querySelector<HTMLInputElement>('input[id^="catno-"]');
    if (!row || !catalogNumberInput) {
        return undefined;
    }

    setInputValue(labelInput, LABEL_MBID);
    return { catalogNumberInput, row };
}

export function initMilieuMusicAutofill(): void {
    let addedLabel: AddedLabel | undefined;
    let catalogNumberHandled = false;
    let labelInsertionHandled = false;
    let pollInterval: number | undefined;

    const annotationInputListener = (event: Event): void => {
        if (event.target instanceof HTMLTextAreaElement && event.target.id === 'annotation') {
            update();
        }
    };

    const stopWatching = (): void => {
        document.removeEventListener('input', annotationInputListener, true);
        if (pollInterval !== undefined) {
            window.clearInterval(pollInterval);
            pollInterval = undefined;
        }
    };

    const update = (): void => {
        const annotation = annotationText();
        if (!annotation || !MILIEU_MUSIC_PATTERN.test(annotation)) {
            return;
        }

        if (!labelInsertionHandled) {
            const label = findEmptyLabel();
            if (!label) {
                return;
            }

            addedLabel = label;
            labelInsertionHandled = true;
        }

        if (!addedLabel?.row.isConnected) {
            stopWatching();
            return;
        }

        if (catalogNumberHandled) {
            stopWatching();
            return;
        }

        const catalogNumber = extractCatalogNumber(annotation);
        if (!catalogNumber) {
            return;
        }

        if (!addedLabel.catalogNumberInput.value.trim()) {
            setInputValue(addedLabel.catalogNumberInput, catalogNumber);
        }
        catalogNumberHandled = true;
        stopWatching();
    };

    document.addEventListener('input', annotationInputListener, true);
    pollInterval = window.setInterval(update, POLL_INTERVAL_MS);
    update();
}
