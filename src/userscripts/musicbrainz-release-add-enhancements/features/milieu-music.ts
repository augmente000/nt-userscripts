import { setInputValue } from '../utils/input';

const CATALOG_NUMBER_PATTERN = /\bMilieu\s+Music\s+number\s+([^\s,.;:!?()[\]{}]+)/iu;
const MILIEU_MUSIC_MBID = '30166e7a-d7ca-4b32-9e22-2228958db577';
const MILIEU_MUSIC_DIGITAL_MBID = '51e69c25-113c-4052-b430-837f9eebb3ac';
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

function findMilieuMusicLabel(): AddedLabel | undefined {
    const labelInput = document.querySelector<HTMLInputElement>('input[id^="label-"]');
    if (!labelInput) {
        return undefined;
    }

    const labelValue = labelInput.value.trim();
    let labelMbid: string;
    if (labelValue === 'Milieu Music') {
        labelMbid = MILIEU_MUSIC_MBID;
    } else if (labelValue === 'Milieu Music Digital') {
        labelMbid = MILIEU_MUSIC_DIGITAL_MBID;
    } else if (!labelValue) {
        labelMbid = MILIEU_MUSIC_DIGITAL_MBID;
    } else {
        return undefined;
    }

    const row = labelInput.closest<HTMLTableRowElement>('tr');
    const catalogNumberInput = row?.querySelector<HTMLInputElement>('input[id^="catno-"]');
    if (!row || !catalogNumberInput) {
        return undefined;
    }

    setInputValue(labelInput, labelMbid);
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
            const label = findMilieuMusicLabel();
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
