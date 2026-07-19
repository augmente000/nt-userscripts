export type ReleaseType = 'album' | 'track';

export interface ReleaseTask {
    title: string;
    url: string;
}

export interface TralbumCurrent {
    id: number;
    title: string;
    type: ReleaseType;
}

export interface TralbumData {
    current: TralbumCurrent;
    freeDownloadPage: string | null;
    hasAudio: boolean;
    id: number;
    is_purchased: boolean;
    item_type: string;
    url: string;
    art_id?: number | null;
}

export interface ReleaseInfo {
    artworkUrl: string | null;
    artist: string;
    document: Document;
    fanId: number | null;
    isFree: boolean;
    paymentDownloadPage: string | null;
    title: string;
    tralbum: TralbumData;
    url: string;
}

export type ResolutionKind = 'direct-free' | 'email-gated' | 'previous-download' | 'purchased';

export interface CookedDownload {
    flacUrl: string;
    itemId: number;
    itemType: ReleaseType;
}

export interface DownloadResult {
    detail: string;
    outcome: 'completed' | 'skipped';
}

export interface BinaryResponse {
    body: ArrayBuffer;
    contentType: string | null;
    fileName: string | null;
}

export interface ProgressSnapshot {
    active: number;
    completed: number;
    current: string[];
    failed: number;
    progress: number;
    queued: number;
    skipped: number;
    total: number;
}
