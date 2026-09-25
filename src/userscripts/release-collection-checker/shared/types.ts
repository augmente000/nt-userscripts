export interface CmsRelease {
    id: string;
}

export interface SiteRelease {
    element: HTMLElement;
    getExternalUrl: () => Promise<string | null>;
    key: string;
}

export interface SiteAdapter {
    findReleases: (document: Document) => SiteRelease[];
    id: string;
    matches: (url: URL) => boolean;
}
