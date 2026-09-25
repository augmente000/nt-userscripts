export class PersistentCache<T> {
    private readonly values: Record<string, T>;

    constructor(
        private readonly storageKey: string,
        private readonly isValue: (value: unknown) => value is T,
    ) {
        this.values = this.load();
    }

    delete(key: string): void {
        delete this.values[key];
        this.save();
    }

    get(key: string): T | undefined {
        return this.values[key];
    }

    set(key: string, value: T): void {
        this.values[key] = value;
        this.save();
    }

    private load(): Record<string, T> {
        try {
            const storedValue = localStorage.getItem(this.storageKey);
            if (!storedValue) {
                return {};
            }

            const parsedValue = JSON.parse(storedValue) as unknown;
            if (typeof parsedValue !== 'object' || parsedValue === null || Array.isArray(parsedValue)) {
                return {};
            }

            return Object.fromEntries(Object.entries(parsedValue).filter(([, value]) => this.isValue(value)));
        } catch (error) {
            console.warn(`Release Collection Checker: could not read cache ${this.storageKey}.`, error);
            return {};
        }
    }

    private save(): void {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.values));
        } catch (error) {
            console.warn(`Release Collection Checker: could not save cache ${this.storageKey}.`, error);
        }
    }
}
