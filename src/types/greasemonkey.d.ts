/// <reference types="greasemonkey" />

declare const unsafeWindow: Window;

interface GmRequestResponse {
    finalUrl: string;
    lengthComputable: boolean;
    loaded: number;
    response: unknown;
    responseHeaders: string;
    responseText?: unknown;
    status: number;
    total: number;
}

interface GmRequestDetails {
    data?: string | undefined;
    headers?: Record<string, string> | undefined;
    method: 'GET' | 'POST';
    onabort?: (response: GmRequestResponse) => void;
    onerror?: (response: GmRequestResponse) => void;
    onload?: (response: GmRequestResponse) => void;
    onprogress?: (response: GmRequestResponse) => void;
    ontimeout?: () => void;
    overrideMimeType?: string;
    responseType?: 'arraybuffer' | 'blob' | 'text';
    timeout?: number;
    url: string;
}

interface GmAbortHandle {
    abort(): void;
}

declare function GM_xmlhttpRequest(details: GmRequestDetails): GmAbortHandle;

interface GmDownloadError {
    error?: string;
}

interface GmDownloadProgress {
    lengthComputable: boolean;
    loaded: number;
    total: number;
}

interface GmDownloadDetails {
    name: string;
    onabort?: () => void;
    onerror?: (error: GmDownloadError) => void;
    onload?: () => void;
    onprogress?: (progress: GmDownloadProgress) => void;
    saveAs?: boolean;
    url: string;
}

declare function GM_download(details: GmDownloadDetails): GmAbortHandle;

declare function GM_openInTab(
    url: string,
    options?: {
        active?: boolean;
        insert?: boolean;
        setParent?: boolean;
        incognito?: boolean;
    },
): unknown;
