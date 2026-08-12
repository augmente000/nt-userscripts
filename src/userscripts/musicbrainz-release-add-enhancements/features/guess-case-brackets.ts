import { setInputValue } from '../utils/input';

const GUESS_CASE_BUTTON_SELECTOR = 'button.guesscase-title, #guess-case-button, button[data-bind*="guessMediumCase"]';
const TITLE_INPUT_SELECTOR = 'input.track-name, input[id^="medium-title-"]';
const bracketOnlyPreviewValues = new WeakMap<HTMLButtonElement, Map<HTMLInputElement, string>>();

function normalizeSquareBrackets(value: string): string {
    return value.replaceAll('[', '(').replaceAll(']', ')');
}

function individualTitleInput(button: HTMLButtonElement): HTMLInputElement | undefined {
    const trackTitle = button.closest('tr')?.querySelector<HTMLInputElement>('input.track-name');
    if (trackTitle) {
        return trackTitle;
    }

    return button.parentElement?.querySelector<HTMLInputElement>('input[type="text"]') ?? undefined;
}

function affectedTitleInputs(button: HTMLButtonElement): HTMLInputElement[] {
    if (button.id === 'guess-case-button') {
        return Array.from(document.querySelectorAll<HTMLInputElement>(`#tracklist ${TITLE_INPUT_SELECTOR}`));
    }

    if (button.matches('[data-bind*="guessMediumCase"]')) {
        return Array.from(
            button.closest('.advanced-medium')?.querySelectorAll<HTMLInputElement>(TITLE_INPUT_SELECTOR) ?? [],
        );
    }

    const input = individualTitleInput(button);
    return input ? [input] : [];
}

function normalizeInputs(inputs: HTMLInputElement[]): void {
    for (const input of inputs) {
        const normalized = normalizeSquareBrackets(input.value);
        if (normalized !== input.value) {
            setInputValue(input, normalized);
        }
    }
}

function normalizePreviewInputs(button: HTMLButtonElement, inputs: HTMLInputElement[]): void {
    const originalValues = new Map<HTMLInputElement, string>();

    for (const input of inputs) {
        const normalized = normalizeSquareBrackets(input.value);
        if (normalized === input.value) {
            continue;
        }

        if (!input.classList.contains('preview')) {
            originalValues.set(input, input.value);
            input.classList.add('preview');
        }
        input.value = normalized;
    }

    if (originalValues.size > 0) {
        bracketOnlyPreviewValues.set(button, originalValues);
    }
}

function restoreBracketOnlyPreview(button: HTMLButtonElement): void {
    const originalValues = bracketOnlyPreviewValues.get(button);
    if (!originalValues) {
        return;
    }

    for (const [input, originalValue] of originalValues) {
        input.value = originalValue;
        input.classList.remove('preview');
    }
    bracketOnlyPreviewValues.delete(button);
}

function commitBracketOnlyPreview(button: HTMLButtonElement): void {
    const originalValues = bracketOnlyPreviewValues.get(button);
    if (!originalValues) {
        return;
    }

    for (const input of originalValues.keys()) {
        input.classList.remove('preview');
    }
    bracketOnlyPreviewValues.delete(button);
}

function guessCaseButton(event: Event): HTMLButtonElement | undefined {
    if (!(event.target instanceof Element)) {
        return undefined;
    }

    return event.target.closest<HTMLButtonElement>(GUESS_CASE_BUTTON_SELECTOR) ?? undefined;
}

export function initGuessCaseBracketNormalization(): void {
    document.addEventListener('click', event => {
        const button = guessCaseButton(event);
        if (!button) {
            return;
        }

        commitBracketOnlyPreview(button);
        queueMicrotask(() => normalizeInputs(affectedTitleInputs(button)));
    });

    document.addEventListener('mouseover', event => {
        const button = guessCaseButton(event);
        if (!button || (event.relatedTarget instanceof Node && button.contains(event.relatedTarget))) {
            return;
        }

        queueMicrotask(() => normalizePreviewInputs(button, affectedTitleInputs(button)));
    });

    document.addEventListener('mouseout', event => {
        const button = guessCaseButton(event);
        if (!button || (event.relatedTarget instanceof Node && button.contains(event.relatedTarget))) {
            return;
        }

        queueMicrotask(() => restoreBracketOnlyPreview(button));
    });
}
