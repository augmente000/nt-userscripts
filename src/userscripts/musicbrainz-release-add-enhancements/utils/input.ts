export function setInputValue(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(
        new InputEvent('input', {
            bubbles: true,
            data: value,
            inputType: 'insertFromPaste',
        }),
    );
}
