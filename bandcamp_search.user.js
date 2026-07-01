// ==UserScript==
// @name         Search Bandcamp releases on trackers
// @description  Add a button on Bandcamp's album pages to search the album artist + album name on trackers
// @version      2026.06.30.2
// @downloadURL  https://update.greasyfork.org/scripts/584978/Search%20Bandcamp%20releases%20on%20trackers.user.js
// @updateURL    https://update.greasyfork.org/scripts/584978/Search%20Bandcamp%20releases%20on%20trackers.user.js
// @match        https://*.bandcamp.com/
// @match        https://*.bandcamp.com/music
// @match        https://*.bandcamp.com/album/*
// @match        https://*.bandcamp.com/track/*
// @match        https://*/music
// @match        https://*/album/*
// @match        https://*/track/*
// @grant        unsafeWindow
// @run-at       document-end
// ==/UserScript==

if (!unsafeWindow) {
    /* oxlint-disable-next-line no-global-assign */
    unsafeWindow = window;
}

function getReleaseData() {
    const tralbum = unsafeWindow.TralbumData;
    const mobile = unsafeWindow.TralbumJSONLD;

    const artist = tralbum?.artist || mobile?.byArtist?.name || '';
    const title = tralbum?.current?.title || mobile?.name || '';

    if (!artist || !title) {
        return null;
    }
    return { artist: artist.trim(), title: title.trim() };
}

const CONTAINER_ID = 'bc_tracker_search';

// Favicon URLs for each tracker. Leave as an empty string to render the button without an icon.
const ICON_RUTRACKER = 'https://rutracker.me/favicon.ico';
const ICON_RED = 'https://redacted.sh/favicon.ico';
const ICON_NNM = 'https://nnmclub.to/favicon.ico';
const ICON_NEWTEAM = 'https://new-team.org/favicon.ico';
const ICON_ORPHEUS = 'https://orpheus.network/favicon.ico';

const TRACKERS = [
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
        // NNM expects windows-1251 encoded form data; let the browser encode it.
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

const GROUPS = [
    { idSuffix: 'release', caption: 'Artist + Release', buildQuery: release => `${release.artist} ${release.title}` },
    { idSuffix: 'artist', caption: 'Artist', buildQuery: release => release.artist },
];

function applyButtonStyle(element, tracker) {
    Object.assign(element.style, {
        display: 'inline-block',
        marginRight: '6px',
        padding: '3px 8px',
        border: `1px solid ${tracker.color}`,
        borderRadius: '3px',
        background: tracker.color,
        color: '#fff',
        fontSize: '11px',
        fontWeight: 'bold',
        textDecoration: 'none',
        lineHeight: 'normal',
        fontFamily: 'inherit',
        cursor: 'pointer',
        transition: 'background 0.15s ease, border-color 0.15s ease',
    });
    element.addEventListener('mouseenter', () => {
        element.style.background = tracker.hoverColor;
        element.style.borderColor = tracker.hoverColor;
    });
    element.addEventListener('mouseleave', () => {
        element.style.background = tracker.color;
        element.style.borderColor = tracker.color;
    });
}

function setButtonContent(element, tracker) {
    if (tracker.icon) {
        const img = document.createElement('img');
        img.src = tracker.icon;
        img.alt = '';
        Object.assign(img.style, {
            width: '14px',
            height: '14px',
            marginRight: '5px',
            verticalAlign: 'middle',
        });
        element.appendChild(img);
    }
    const label = document.createElement('span');
    label.textContent = tracker.label;
    label.style.verticalAlign = 'middle';
    element.appendChild(label);
}

function buildButton(tracker, query, idSuffix) {
    const titleText = `Search "${query}" on ${tracker.name} (opens in a new tab)`;

    if (tracker.method === 'post') {
        const form = document.createElement('form');
        form.id = `${tracker.id}_${idSuffix}`;
        form.method = 'post';
        form.action = tracker.action;
        form.target = '_blank';
        form.style.display = 'inline-block';
        form.style.margin = '0';
        if (tracker.acceptCharset) {
            form.acceptCharset = tracker.acceptCharset;
        }

        const fields = tracker.fields(query);
        Object.keys(fields).forEach(fieldName => {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = fieldName;
            input.value = fields[fieldName];
            form.appendChild(input);
        });

        const button = document.createElement('button');
        button.type = 'submit';
        button.title = titleText;
        applyButtonStyle(button, tracker);
        setButtonContent(button, tracker);
        form.appendChild(button);
        return form;
    }

    const link = document.createElement('a');
    link.id = `${tracker.id}_${idSuffix}`;
    link.href = tracker.buildUrl(query, idSuffix);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.title = titleText;
    applyButtonStyle(link, tracker);
    setButtonContent(link, tracker);
    return link;
}

function buildGroup(group, release) {
    const container = document.createElement('div');
    Object.assign(container.style, {
        border: '1px solid rgba(0, 0, 0, 0.15)',
        borderRadius: '4px',
        padding: '6px 8px',
    });

    const caption = document.createElement('div');
    caption.textContent = group.caption;
    Object.assign(caption.style, {
        fontSize: '10px',
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        opacity: '0.6',
        marginBottom: '5px',
    });
    container.appendChild(caption);

    const query = group.buildQuery(release);
    TRACKERS.forEach(tracker => {
        container.appendChild(buildButton(tracker, query, group.idSuffix));
    });
    return container;
}

function insertButton(release) {
    const anchor = document.querySelector('div#customHeaderWrapper');
    if (!anchor) {
        return;
    }
    if (document.getElementById(CONTAINER_ID)) {
        return;
    }

    const wrapper = document.createElement('div');
    wrapper.id = CONTAINER_ID;
    wrapper.style.margin = '6px 0';

    const header = document.createElement('div');
    header.textContent = 'Search';
    Object.assign(header.style, {
        fontSize: '16px',
        fontWeight: 'bold',
        marginBottom: '6px',
    });
    wrapper.appendChild(header);

    const groupsRow = document.createElement('div');
    Object.assign(groupsRow.style, {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px',
        alignItems: 'flex-start',
    });
    GROUPS.forEach(group => {
        groupsRow.appendChild(buildGroup(group, release));
    });
    wrapper.appendChild(groupsRow);

    anchor.insertAdjacentElement('afterend', wrapper);
}

function init() {
    const release = getReleaseData();
    if (!release) {
        return;
    }
    insertButton(release);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
