import { initLabelAutofill } from './label-autofill';

const MILIEU_MUSIC_MBID = '30166e7a-d7ca-4b32-9e22-2228958db577';
const MILIEU_MUSIC_DIGITAL_MBID = '51e69c25-113c-4052-b430-837f9eebb3ac';

export function initMilieuMusicAutofill(): void {
    initLabelAutofill({
        annotationPattern: /\bMilieu\s+Music\b/iu,
        catalogNumberPattern: /\bMilieu\s+Music\s+number\s+([^\s,.;:!?()[\]{}]+)/iu,
        defaultLabelId: MILIEU_MUSIC_DIGITAL_MBID,
        labels: [
            { id: MILIEU_MUSIC_MBID, names: ['Milieu Music'] },
            { id: MILIEU_MUSIC_DIGITAL_MBID, names: ['Milieu Music Digital'] },
        ],
    });
}
