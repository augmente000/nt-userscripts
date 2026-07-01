import type { SearchGroup, Tracker } from './types.ts';

const ICON_RUTRACKER = 'https://rutracker.me/favicon.ico';
const ICON_RED = 'https://redacted.sh/favicon.ico';
const ICON_NNM = 'https://nnmclub.to/favicon.ico';
const ICON_NEWTEAM = 'https://new-team.org/favicon.ico';
const ICON_ORPHEUS = 'https://orpheus.network/favicon.ico';

export const TRACKERS: Tracker[] = [
    {
        id: 'rutracker',
        name: 'RuTracker',
        label: 'RTO',
        icon: ICON_RUTRACKER,
        color: '#408294',
        hoverColor: '#2f6573',
        method: 'get',
        buildUrl: query => `https://rutracker.me/forum/tracker.php?${new URLSearchParams({ nm: query }).toString()}`,
    },
    {
        id: 'red',
        name: 'RED',
        label: 'RED',
        icon: ICON_RED,
        color: '#c0392b',
        hoverColor: '#962d22',
        method: 'get',
        buildUrl: (query, mode) =>
            mode === 'artist'
                ? `https://redacted.sh/artist.php?${new URLSearchParams({ artistname: query }).toString()}`
                : `https://redacted.sh/torrents.php?${new URLSearchParams({ searchstr: query }).toString()}`,
    },
    {
        id: 'nnm',
        name: 'NNM-Club',
        label: 'NNM',
        icon: ICON_NNM,
        color: '#5b7a1c',
        hoverColor: '#445a15',
        method: 'post',
        action: 'https://nnmclub.to/forum/tracker.php',
        acceptCharset: 'windows-1251',
        fields: query => ({ f: '-1', nm: query, search_submit: 'Искать' }),
    },
    {
        id: 'newteam',
        name: 'New-Team',
        label: 'NT',
        icon: ICON_NEWTEAM,
        color: '#8e44ad',
        hoverColor: '#6c3483',
        method: 'get',
        buildUrl: query => `https://new-team.org/search?${new URLSearchParams({ q: query }).toString()}`,
    },
    {
        id: 'orpheus',
        name: 'Orpheus',
        label: 'OPS',
        icon: ICON_ORPHEUS,
        color: '#d35400',
        hoverColor: '#a84300',
        method: 'get',
        buildUrl: (query, mode) =>
            mode === 'artist'
                ? `https://orpheus.network/artist.php?${new URLSearchParams({ artistname: query }).toString()}`
                : `https://orpheus.network/torrents.php?${new URLSearchParams({ searchstr: query }).toString()}`,
    },
];

export const GROUPS: SearchGroup[] = [
    { idSuffix: 'release', caption: 'Artist + Release', buildQuery: release => `${release.artist} ${release.title}` },
    { idSuffix: 'artist', caption: 'Artist', buildQuery: release => release.artist },
];
