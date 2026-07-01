export interface Release {
    artist: string;
    title: string;
}

export interface TrackerBase {
    id: string;
    name: string;
    label: string;
    icon: string;
    color: string;
    hoverColor: string;
}

export interface GetTracker extends TrackerBase {
    method: 'get';
    buildUrl: (query: string, mode: string) => string;
}

export interface PostTracker extends TrackerBase {
    method: 'post';
    action: string;
    acceptCharset?: string;
    fields: (query: string) => Record<string, string>;
}

export type Tracker = GetTracker | PostTracker;

export interface SearchGroup {
    idSuffix: string;
    caption: string;
    buildQuery: (release: Release) => string;
}
