import type { Release } from './types.ts';

interface TralbumData {
    artist?: string;
    current?: {
        title?: string;
    };
}

interface TralbumJSONLD {
    byArtist?: {
        name?: string;
    };
    name?: string;
}

interface BandcampWindow extends Window {
    TralbumData?: TralbumData;
    TralbumJSONLD?: TralbumJSONLD;
}

function getBandcampWindow(): BandcampWindow {
    /* oxlint-disable-next-line no-global-assign */
    if (typeof unsafeWindow === 'undefined') {
        return window;
    }
    return unsafeWindow;
}

export function getReleaseData(): Release | null {
    const pageWindow = getBandcampWindow();
    const tralbum = pageWindow.TralbumData;
    const mobile = pageWindow.TralbumJSONLD;

    const artist = tralbum?.artist ?? mobile?.byArtist?.name ?? '';
    const title = tralbum?.current?.title ?? mobile?.name ?? '';

    if (!artist || !title) {
        return null;
    }

    return { artist: artist.trim(), title: title.trim() };
}
