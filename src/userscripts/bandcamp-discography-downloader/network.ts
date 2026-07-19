import type { BinaryResponse } from './types.ts';

interface RequestOptions {
    data?: string;
    headers?: Record<string, string>;
    method?: 'GET' | 'POST';
    onProgress?: (loaded: number, total: number | null) => void;
    overrideMimeType?: string;
    responseType?: 'arraybuffer' | 'blob' | 'text';
    signal?: AbortSignal;
    timeout?: number;
}

interface ResponseData {
    body: unknown;
    finalUrl: string;
    headers: string;
    status: number;
}

const BINARY_CHUNK_SIZE = 8 * 1_048_576;

export class HttpError extends Error {
    readonly status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = 'HttpError';
        this.status = status;
    }
}

export function abortError(signal?: AbortSignal): Error {
    if (signal?.reason instanceof Error) {
        return signal.reason;
    }
    return new DOMException('Download stopped', 'AbortError');
}

export function request(url: string, options: RequestOptions = {}): Promise<ResponseData> {
    return new Promise((resolve, reject) => {
        if (options.signal?.aborted) {
            reject(abortError(options.signal));
            return;
        }

        let settled = false;
        let handle: GmAbortHandle | undefined;
        const cleanup = (): void => options.signal?.removeEventListener('abort', abort);
        const resolveOnce = (response: ResponseData): void => {
            if (settled) {
                return;
            }
            settled = true;
            cleanup();
            resolve(response);
        };
        const rejectOnce = (error: Error): void => {
            if (settled) {
                return;
            }
            settled = true;
            cleanup();
            reject(error);
        };
        const abort = (): void => {
            try {
                handle?.abort();
            } finally {
                rejectOnce(abortError(options.signal));
            }
        };

        options.signal?.addEventListener('abort', abort, { once: true });
        handle = GM_xmlhttpRequest({
            data: options.data,
            headers: options.headers,
            method: options.method ?? 'GET',
            onabort: () => rejectOnce(abortError(options.signal)),
            onerror: response =>
                rejectOnce(
                    options.signal?.aborted
                        ? abortError(options.signal)
                        : new HttpError(`Network request failed for ${url}`, response.status),
                ),
            onload: response => {
                if (response.status < 200 || response.status >= 300) {
                    rejectOnce(new HttpError(`Request failed (${response.status}) for ${url}`, response.status));
                    return;
                }

                if (response.response === null && response.responseText == null) {
                    console.warn('[Bandcamp Collection Downloader] Binary response diagnostic', {
                        contentLength: headerValue(response.responseHeaders, 'content-length'),
                        contentRange: headerValue(response.responseHeaders, 'content-range'),
                        contentType: headerValue(response.responseHeaders, 'content-type'),
                        keys: Object.keys(response).sort(),
                        lengthComputable: response.lengthComputable,
                        loaded: response.loaded,
                        requestedResponseType: options.responseType,
                        responseTag: Object.prototype.toString.call(response.response),
                        responseTextLength: null,
                        responseTextTag: Object.prototype.toString.call(response.responseText),
                        status: response.status,
                        total: response.total,
                    });
                }

                resolveOnce({
                    body: response.response ?? response.responseText,
                    finalUrl: response.finalUrl || url,
                    headers: response.responseHeaders,
                    status: response.status,
                });
            },
            onprogress: response => {
                options.onProgress?.(response.loaded, response.lengthComputable ? response.total : null);
            },
            ontimeout: () => rejectOnce(new Error(`Request timed out: ${url}`)),
            ...(options.overrideMimeType ? { overrideMimeType: options.overrideMimeType } : {}),
            responseType: options.responseType ?? 'text',
            timeout: options.timeout ?? 45_000,
            url,
        });
        if (options.signal?.aborted) {
            abort();
        }
    });
}

export async function requestText(url: string, options: RequestOptions = {}): Promise<string> {
    const response = await request(url, { ...options, responseType: 'text' });
    if (typeof response.body !== 'string') {
        throw new Error(`Expected a text response from ${url}`);
    }
    return response.body;
}

export async function requestJson<T>(url: string, options: RequestOptions = {}): Promise<T> {
    const text = await requestText(url, options);
    try {
        return JSON.parse(text) as T;
    } catch {
        throw new Error(`Invalid JSON response from ${url}`);
    }
}

function headerValue(headers: string, name: string): string | null {
    const prefix = `${name.toLowerCase()}:`;
    const line = headers.split(/\r?\n/).find(candidate => candidate.toLowerCase().startsWith(prefix));
    return line ? line.slice(line.indexOf(':') + 1).trim() : null;
}

function contentDispositionFileName(value: string | null): string | null {
    if (!value) {
        return null;
    }

    const encoded = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(value)?.[1];
    if (encoded) {
        try {
            return decodeURIComponent(encoded.trim());
        } catch {
            return encoded.trim();
        }
    }

    return /filename\s*=\s*"([^"]+)"/i.exec(value)?.[1] ?? /filename\s*=\s*([^;]+)/i.exec(value)?.[1]?.trim() ?? null;
}

export async function requestBinary(
    url: string,
    onProgress?: (loaded: number, total: number | null) => void,
    signal?: AbortSignal,
): Promise<BinaryResponse> {
    const response = await request(url, {
        ...(onProgress ? { onProgress } : {}),
        overrideMimeType: 'text/plain; charset=x-user-defined',
        responseType: 'text',
        ...(signal ? { signal } : {}),
        timeout: 0,
    });
    const body = await normalizeBinaryBody(response.body, url);

    return {
        body,
        contentType: headerValue(response.headers, 'content-type'),
        fileName: contentDispositionFileName(headerValue(response.headers, 'content-disposition')),
    };
}

export async function requestBinaryChunked(
    url: string,
    onProgress?: (loaded: number, total: number | null) => void,
    signal?: AbortSignal,
): Promise<BinaryResponse> {
    const chunks: Uint8Array[] = [];
    let contentType: string | null = null;
    let fileName: string | null = null;
    let loaded = 0;
    let total: number | null = null;

    while (total === null || loaded < total) {
        const rangeEnd = loaded + BINARY_CHUNK_SIZE - 1;
        const chunkOffset = loaded;
        const response = await request(url, {
            headers: { Range: `bytes=${chunkOffset}-${rangeEnd}` },
            onProgress: chunkLoaded => {
                onProgress?.(chunkOffset + chunkLoaded, total);
            },
            overrideMimeType: 'text/plain; charset=x-user-defined',
            responseType: 'text',
            ...(signal ? { signal } : {}),
            timeout: 0,
        });
        const body = new Uint8Array(await normalizeBinaryBody(response.body, url));
        const contentRange = headerValue(response.headers, 'content-range');
        const match = /^bytes\s+(\d+)-(\d+)\/(\d+)$/i.exec(contentRange ?? '');

        if (response.status === 200) {
            total = body.byteLength;
        } else if (response.status === 206 && match) {
            const start = Number(match[1]);
            const end = Number(match[2]);
            total = Number(match[3]);
            if (start !== chunkOffset || end < start || body.byteLength !== end - start + 1 || total <= end) {
                throw new Error(`Bandcamp returned an invalid byte range for ${url}`);
            }
        } else {
            throw new Error(`Bandcamp did not honor the requested byte range for ${url}`);
        }

        if (body.byteLength === 0) {
            throw new Error(`Bandcamp returned an empty byte range for ${url}`);
        }
        contentType ??= headerValue(response.headers, 'content-type');
        fileName ??= contentDispositionFileName(headerValue(response.headers, 'content-disposition'));
        chunks.push(body);
        loaded += body.byteLength;
        onProgress?.(loaded, total);
    }

    const body = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return { body: body.buffer, contentType, fileName };
}

async function normalizeBinaryBody(value: unknown, url: string): Promise<ArrayBuffer> {
    if (typeof value === 'string') {
        const body = new Uint8Array(value.length);
        for (let index = 0; index < value.length; index += 1) {
            body[index] = value.charCodeAt(index) & 0xff;
        }
        return body.buffer;
    }
    if (Object.prototype.toString.call(value) === '[object ArrayBuffer]') {
        return new Uint8Array(value as ArrayBuffer).slice().buffer;
    }
    if (ArrayBuffer.isView(value)) {
        return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice().buffer;
    }
    if (
        Object.prototype.toString.call(value) === '[object Blob]' &&
        typeof (value as { arrayBuffer?: unknown }).arrayBuffer === 'function'
    ) {
        return (value as Blob).arrayBuffer();
    }
    const tag = Object.prototype.toString.call(value);
    throw new Error(`Expected a binary response from ${url} (received ${tag})`);
}

export function formEncode(values: Record<string, string | number>): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
        params.set(key, String(value));
    }
    return params.toString();
}

export function sleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(abortError(signal));
            return;
        }
        const finish = (): void => {
            signal?.removeEventListener('abort', abort);
            resolve();
        };
        const timeout = window.setTimeout(finish, milliseconds);
        const abort = (): void => {
            window.clearTimeout(timeout);
            signal?.removeEventListener('abort', abort);
            reject(abortError(signal));
        };
        signal?.addEventListener('abort', abort, { once: true });
    });
}
