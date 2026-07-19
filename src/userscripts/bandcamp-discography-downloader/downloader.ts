import { classifyRelease, fetchCookedDownload, resolvePurchasedDownload } from './bandcamp.ts';
import { GuerrillaInbox } from './guerrilla-mail.ts';
import { abortError, requestBinaryChunked, requestText } from './network.ts';
import type { BinaryResponse, CookedDownload, DownloadResult, ReleaseInfo } from './types.ts';
import { createZip } from './zip.ts';

type StatusReporter = (message: string, progress?: number) => void;
type PayloadKind = 'flac' | 'zip';

function safeFileName(value: string): string {
    const clean = value
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
        .replace(/[. ]+$/g, '')
        .trim();
    return clean || 'Bandcamp download';
}

function releaseBaseName(release: ReleaseInfo): string {
    return safeFileName(`${release.artist} - ${release.title}`);
}

function extensionFromArtwork(response: BinaryResponse, url: string): string {
    const contentType = response.contentType?.split(';')[0]?.trim().toLowerCase();
    const knownTypes: Record<string, string> = {
        'image/avif': 'avif',
        'image/gif': 'gif',
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
    };
    if (contentType && knownTypes[contentType]) {
        return knownTypes[contentType];
    }
    const extension = /\.([a-z0-9]{2,5})(?:$|[?#])/i.exec(url)?.[1]?.toLowerCase();
    return extension && ['avif', 'gif', 'jpeg', 'jpg', 'png', 'webp'].includes(extension) ? extension : 'jpg';
}

function browserSave(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.style.display = 'none';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function gmDownload(
    url: string,
    name: string,
    onProgress: (loaded: number, total: number | null) => void,
    signal: AbortSignal,
): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal.aborted) {
            reject(abortError(signal));
            return;
        }

        let settled = false;
        let handle: GmAbortHandle | undefined;
        const cleanup = (): void => signal.removeEventListener('abort', abort);
        const resolveOnce = (): void => {
            if (settled) {
                return;
            }
            settled = true;
            cleanup();
            resolve();
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
                rejectOnce(abortError(signal));
            }
        };

        signal.addEventListener('abort', abort, { once: true });
        handle = GM_download({
            name,
            onabort: () => rejectOnce(abortError(signal)),
            onerror: error =>
                rejectOnce(
                    signal.aborted ? abortError(signal) : new Error(error.error || `Could not download ${name}`),
                ),
            onload: resolveOnce,
            onprogress: progress => {
                const total = progress.lengthComputable ? progress.total : null;
                onProgress(progress.loaded, total);
                if (total !== null && total > 0 && progress.loaded >= total) {
                    resolveOnce();
                }
            },
            saveAs: false,
            url,
        });
        if (signal.aborted) {
            abort();
        }
    });
}

function percentage(loaded: number, total: number | null): string {
    if (!total || total <= 0) {
        return `${Math.round(loaded / 1_048_576)} MiB`;
    }
    return `${Math.min(100, Math.round((loaded / total) * 100))}%`;
}

async function refreshedUrl(downloadUrl: string, signal: AbortSignal): Promise<string | null> {
    const statUrl = downloadUrl.replace('/download/', '/statdownload/');
    if (statUrl === downloadUrl) {
        return null;
    }
    const response = await requestText(statUrl, { signal });
    const encoded = /"retry_url"\s*:\s*("(?:\\.|[^"\\])*")/.exec(response)?.[1];
    if (!encoded) {
        return null;
    }
    try {
        const parsed = JSON.parse(encoded) as unknown;
        return typeof parsed === 'string' && parsed ? new URL(parsed, downloadUrl).href : null;
    } catch {
        return null;
    }
}

function hasExpectedSignature(response: BinaryResponse, kind: PayloadKind): boolean {
    const bytes = new Uint8Array(response.body, 0, Math.min(response.body.byteLength, 4));
    if (kind === 'flac') {
        return bytes[0] === 0x66 && bytes[1] === 0x4c && bytes[2] === 0x61 && bytes[3] === 0x43;
    }
    return (
        bytes[0] === 0x50 &&
        bytes[1] === 0x4b &&
        ((bytes[2] === 0x03 && bytes[3] === 0x04) ||
            (bytes[2] === 0x05 && bytes[3] === 0x06) ||
            (bytes[2] === 0x07 && bytes[3] === 0x08))
    );
}

async function requestExpectedBinary(
    url: string,
    kind: PayloadKind,
    onProgress: (loaded: number, total: number | null) => void,
    signal: AbortSignal,
): Promise<BinaryResponse> {
    const response = await requestBinaryChunked(url, onProgress, signal);
    if (!hasExpectedSignature(response, kind)) {
        throw new Error(
            `Bandcamp returned ${response.contentType ?? 'an invalid payload'} instead of ${kind.toUpperCase()}`,
        );
    }
    return response;
}

async function downloadBinaryWithRetry(
    url: string,
    kind: PayloadKind,
    onProgress: (loaded: number, total: number | null) => void,
    signal: AbortSignal,
): Promise<BinaryResponse> {
    const initialUrl =
        (await refreshedUrl(url, signal).catch(error => {
            if (signal.aborted) {
                throw error;
            }
            return null;
        })) ?? url;
    try {
        return await requestExpectedBinary(initialUrl, kind, onProgress, signal);
    } catch (originalError) {
        if (signal.aborted) {
            throw originalError;
        }
        const retry = await refreshedUrl(initialUrl, signal).catch(() => null);
        if (!retry || retry === initialUrl) {
            throw originalError;
        }
        return requestExpectedBinary(retry, kind, onProgress, signal);
    }
}

async function downloadAlbum(
    release: ReleaseInfo,
    download: CookedDownload,
    report: StatusReporter,
    signal: AbortSignal,
): Promise<void> {
    const name = `${releaseBaseName(release)}.zip`;
    const onProgress = (loaded: number, total: number | null): void => {
        report(`Downloading album ${percentage(loaded, total)}`, total ? loaded / total : undefined);
    };
    report('Checking Bandcamp download URL');
    const initialUrl =
        (await refreshedUrl(download.flacUrl, signal).catch(error => {
            if (signal.aborted) {
                throw error;
            }
            return null;
        })) ?? download.flacUrl;
    try {
        await gmDownload(initialUrl, name, onProgress, signal);
    } catch (originalError) {
        if (signal.aborted) {
            throw originalError;
        }
        report('Refreshing the Bandcamp download URL');
        const retry = await refreshedUrl(initialUrl, signal).catch(() => null);
        if (!retry || retry === initialUrl) {
            throw originalError;
        }
        await gmDownload(retry, name, onProgress, signal);
    }
}

async function downloadTrack(
    release: ReleaseInfo,
    download: CookedDownload,
    report: StatusReporter,
    signal: AbortSignal,
): Promise<void> {
    if (!release.artworkUrl) {
        throw new Error('Bandcamp did not provide artwork for this track');
    }

    report('Downloading FLAC');
    const flac = await downloadBinaryWithRetry(
        download.flacUrl,
        'flac',
        (loaded, total) => {
            report(`Downloading FLAC ${percentage(loaded, total)}`, total ? (loaded / total) * 0.9 : undefined);
        },
        signal,
    );
    report('Downloading artwork', 0.9);
    const artwork = await requestBinaryChunked(
        release.artworkUrl,
        (loaded, total) => report('Downloading artwork', total ? 0.9 + (loaded / total) * 0.08 : undefined),
        signal,
    );
    const baseName = releaseBaseName(release);
    const flacName =
        flac.fileName && flac.fileName.toLowerCase().endsWith('.flac')
            ? safeFileName(flac.fileName)
            : `${baseName}.flac`;
    const artworkExtension = extensionFromArtwork(artwork, release.artworkUrl);

    report('Packaging track ZIP', 0.98);
    const zip = createZip([
        { data: flac.body, name: flacName },
        { data: artwork.body, name: `front.${artworkExtension}` },
    ]);
    browserSave(zip, `${baseName}.zip`);
}

async function resolveDownload(
    release: ReleaseInfo,
    inbox: GuerrillaInbox,
    report: StatusReporter,
    signal: AbortSignal,
): Promise<CookedDownload | null> {
    const classification = classifyRelease(release);
    switch (classification) {
        case 'previous-download': {
            report('Resolving previous download');
            return fetchCookedDownload(release.paymentDownloadPage ?? '', signal);
        }
        case 'direct-free': {
            report('Resolving free download');
            return fetchCookedDownload(release.tralbum.freeDownloadPage ?? '', signal);
        }
        case 'email-gated': {
            report('Requesting download email');
            await inbox.requestDownloadEmail(release);
            report('Waiting for Bandcamp email');
            return inbox.waitForDownload(release);
        }
        case 'purchased': {
            report('Finding release in your collection');
            const cookedUrl = await resolvePurchasedDownload(release, signal);
            return fetchCookedDownload(cookedUrl, signal);
        }
        case 'unavailable':
            return null;
    }
}

export async function downloadRelease(
    release: ReleaseInfo,
    inbox: GuerrillaInbox,
    report: StatusReporter,
    signal: AbortSignal,
): Promise<DownloadResult> {
    if (!release.tralbum.hasAudio) {
        return { detail: 'No downloadable audio', outcome: 'skipped' };
    }

    const download = await resolveDownload(release, inbox, report, signal);
    if (!download) {
        return { detail: 'Not free and not in your collection', outcome: 'skipped' };
    }

    if (release.tralbum.current.type === 'track') {
        await downloadTrack(release, download, report, signal);
    } else {
        await downloadAlbum(release, download, report, signal);
    }
    return { detail: 'Saved', outcome: 'completed' };
}
