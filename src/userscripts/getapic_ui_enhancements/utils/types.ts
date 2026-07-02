export type SessionRow = {
    sessionId: string;
    url: string;
    row: HTMLTableRowElement;
};

export type CachedPreviews = {
    html: string;
    fetchedAt: number;
};
