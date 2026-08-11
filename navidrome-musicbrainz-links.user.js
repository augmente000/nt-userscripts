// ==UserScript==
// @name         Navidrome MusicBrainz Release Links
// @description  Shows a MusicBrainz release's external URL relationships on Navidrome album pages.
// @version      2026.08.11.1
// @author       
// @namespace    https://update.greasyfork.org/scripts/590798
// @downloadURL  https://update.greasyfork.org/scripts/590798/navidrome-musicbrainz-links.user.js
// @updateURL    https://update.greasyfork.org/scripts/590798/navidrome-musicbrainz-links.user.js
// @match        http://jrmnas.local:4533/app/*
// @match        https://jrmnas.local:4533/app/*
// @connect      musicbrainz.org
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// @icon         https://musicbrainz.org/static/images/favicons/favicon-32x32.png
// ==/UserScript==

(function () {
    'use strict';

    const API_ROOT = 'https://musicbrainz.org/ws/2/release';
    const BUSY_ERROR = 'The MusicBrainz web server is currently busy. Please try again later.';
    const BUSY_RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 16_000];
    const CACHE_PREFIX = 'nt-navidrome-musicbrainz-release:v1:';
    const CONTAINER_CLASS = 'nt-mb-external-links';
    const MUSICBRAINZ_RELEASE_PATTERN = /^\/release\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:\/|$)/iu;
    const inFlightRequests = new Map();
    class MusicBrainzBusyError extends Error {}
    function cacheKey(releaseId) {
      return `${CACHE_PREFIX}${releaseId}`;
    }
    function readCachedRelease(releaseId) {
      const key = cacheKey(releaseId);
      try {
        const stored = localStorage.getItem(key);
        if (!stored) {
          return undefined;
        }
        const parsed = JSON.parse(stored);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          localStorage.removeItem(key);
          return undefined;
        }
        return parsed;
      } catch {
        try {
          localStorage.removeItem(key);
        } catch {
          // A request can still be made when storage is unavailable.
        }
        return undefined;
      }
    }
    function cacheRelease(releaseId, release) {
      try {
        localStorage.setItem(cacheKey(releaseId), JSON.stringify(release));
      } catch (error) {
        console.warn('[Navidrome MusicBrainz Links] Could not cache the release response.', error);
      }
    }
    function requestRelease(releaseId) {
      const url = `${API_ROOT}/${releaseId}?fmt=json&inc=url-rels`;
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'GET',
          url,
          headers: {
            Accept: 'application/json'
          },
          responseType: 'text',
          timeout: 30_000,
          onload: response => {
            if (typeof response.responseText !== 'string') {
              reject(new Error('MusicBrainz returned an invalid response body.'));
              return;
            }
            resolve({
              body: response.responseText,
              status: response.status
            });
          },
          onabort: () => reject(new Error('The MusicBrainz request was aborted.')),
          onerror: response => reject(new Error(`The MusicBrainz request failed (HTTP ${response.status || 'unknown'}).`)),
          ontimeout: () => reject(new Error('The MusicBrainz request timed out.'))
        });
      });
    }
    function parseReleaseResponse(response) {
      let parsed;
      try {
        parsed = JSON.parse(response.body);
      } catch {
        throw new Error(`MusicBrainz returned invalid JSON (HTTP ${response.status}).`);
      }
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('MusicBrainz returned an unexpected response.');
      }
      const release = parsed;
      if (release.error === BUSY_ERROR) {
        throw new MusicBrainzBusyError(BUSY_ERROR);
      }
      if (response.status < 200 || response.status >= 300) {
        const detail = typeof release.error === 'string' ? `: ${release.error}` : '';
        throw new Error(`MusicBrainz returned HTTP ${response.status}${detail}`);
      }
      if (typeof release.error === 'string') {
        throw new Error(`MusicBrainz returned an error: ${release.error}`);
      }
      return release;
    }
    function wait(milliseconds) {
      return new Promise(resolve => setTimeout(resolve, milliseconds));
    }
    async function fetchRelease(releaseId) {
      const cached = readCachedRelease(releaseId);
      if (cached) {
        return cached;
      }
      for (let attempt = 0;; attempt += 1) {
        try {
          const release = parseReleaseResponse(await requestRelease(releaseId));
          cacheRelease(releaseId, release);
          return release;
        } catch (error) {
          const retryDelay = BUSY_RETRY_DELAYS_MS[attempt];
          if (!(error instanceof MusicBrainzBusyError) || retryDelay === undefined) {
            throw error;
          }
          console.info(`[Navidrome MusicBrainz Links] MusicBrainz is busy; retrying in ${retryDelay / 1_000}s.`);
          await wait(retryDelay);
        }
      }
    }
    function getRelease(releaseId) {
      const activeRequest = inFlightRequests.get(releaseId);
      if (activeRequest) {
        return activeRequest;
      }
      const request = fetchRelease(releaseId).finally(() => inFlightRequests.delete(releaseId));
      inFlightRequests.set(releaseId, request);
      return request;
    }
    function isMusicBrainzHost(hostname) {
      const normalized = hostname.toLowerCase();
      return normalized === 'musicbrainz.org' || normalized.endsWith('.musicbrainz.org');
    }
    function relationUrl(relation) {
      if (typeof relation.url?.resource !== 'string') {
        return undefined;
      }
      try {
        const url = new URL(relation.url.resource);
        if (url.protocol !== 'http:' && url.protocol !== 'https:' || isMusicBrainzHost(url.hostname)) {
          return undefined;
        }
        return url;
      } catch {
        return undefined;
      }
    }
    function externalRelations(release) {
      if (!Array.isArray(release.relations)) {
        return [];
      }
      const seen = new Set();
      const external = [];
      for (const candidate of release.relations) {
        if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
          continue;
        }
        const relation = candidate;
        const url = relationUrl(relation);
        if (relation.ended === true || !url || seen.has(url.href)) {
          continue;
        }
        seen.add(url.href);
        external.push({
          url
        });
      }
      return external;
    }
    function displayHostname(hostname) {
      return hostname.replace(/^www\./iu, '');
    }
    function faviconUrl(url) {
      const favicon = new URL('https://www.google.com/s2/favicons');
      favicon.searchParams.set('sz', '32');
      favicon.searchParams.set('domain_url', url.origin);
      return favicon.href;
    }
    function createRelationLink(relation) {
      const hostname = displayHostname(relation.url.hostname);
      const link = document.createElement('a');
      const image = document.createElement('img');
      link.className = 'nt-mb-external-link';
      link.href = relation.url.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.title = hostname;
      link.setAttribute('aria-label', `Open ${hostname}`);
      image.src = faviconUrl(relation.url);
      image.alt = '';
      image.width = 18;
      image.height = 18;
      image.loading = 'lazy';
      link.append(image);
      return link;
    }
    function renderRelations(container, release) {
      container.replaceChildren(...externalRelations(release).map(createRelationLink));
      container.removeAttribute('aria-busy');
    }
    function renderError(container, releaseId, error) {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'nt-mb-retry';
      retry.textContent = '!';
      retry.title = 'Could not load MusicBrainz links. Click to retry.';
      retry.setAttribute('aria-label', 'Retry loading MusicBrainz links');
      retry.addEventListener('click', () => {
        container.replaceChildren();
        container.dataset['state'] = 'loading';
        container.setAttribute('aria-busy', 'true');
        void loadIntoContainer(container, releaseId);
      });
      container.dataset['state'] = 'error';
      container.removeAttribute('aria-busy');
      container.replaceChildren(retry);
      console.error('[Navidrome MusicBrainz Links] Could not load release relationships.', error);
    }
    async function loadIntoContainer(container, releaseId) {
      try {
        const release = await getRelease(releaseId);
        if (!container.isConnected || container.dataset['releaseId'] !== releaseId) {
          return;
        }
        container.dataset['state'] = 'ready';
        renderRelations(container, release);
      } catch (error) {
        if (container.isConnected && container.dataset['releaseId'] === releaseId) {
          renderError(container, releaseId, error);
        }
      }
    }
    function releaseIdFromLink(link) {
      try {
        const url = new URL(link.href);
        if (!isMusicBrainzHost(url.hostname)) {
          return undefined;
        }
        return MUSICBRAINZ_RELEASE_PATTERN.exec(url.pathname)?.[1]?.toLowerCase();
      } catch {
        return undefined;
      }
    }
    function insertionPoint(link) {
      const parent = link.parentElement;
      return parent?.tagName === 'SPAN' && parent.children.length === 1 ? parent : link;
    }
    function enhanceMusicBrainzLink(link) {
      const releaseId = releaseIdFromLink(link);
      if (!releaseId) {
        return;
      }
      const point = insertionPoint(link);
      const next = point.nextElementSibling;
      if (next instanceof HTMLElement && next.classList.contains(CONTAINER_CLASS)) {
        if (next.dataset['releaseId'] === releaseId) {
          return;
        }
        next.remove();
      }
      const container = document.createElement('span');
      container.className = CONTAINER_CLASS;
      container.dataset['releaseId'] = releaseId;
      container.dataset['state'] = 'loading';
      container.setAttribute('aria-busy', 'true');
      point.after(container);
      void loadIntoContainer(container, releaseId);
    }
    function scan() {
      for (const link of document.querySelectorAll('a[href*="musicbrainz.org/release/"]')) {
        enhanceMusicBrainzLink(link);
      }
    }
    function addStyles() {
      if (document.querySelector('style[data-nt-mb-external-links]')) {
        return;
      }
      const style = document.createElement('style');
      style.dataset['ntMbExternalLinks'] = '';
      style.textContent = `
        .${CONTAINER_CLASS} {
            display: inline-flex;
            align-items: center;
            gap: 3px;
            margin-left: 3px;
            vertical-align: middle;
        }
        .${CONTAINER_CLASS}[data-state="loading"]::after {
            content: "\u2026";
            width: 18px;
            text-align: center;
            opacity: 0.6;
        }
        .nt-mb-external-link,
        .nt-mb-retry {
            box-sizing: content-box;
            display: inline-flex;
            width: 18px;
            height: 18px;
            align-items: center;
            justify-content: center;
            padding: 5px;
            border: 0;
            border-radius: 50%;
            background: transparent;
            color: inherit;
            cursor: pointer;
            line-height: 18px;
            text-decoration: none;
        }
        .nt-mb-external-link:hover,
        .nt-mb-external-link:focus-visible,
        .nt-mb-retry:hover,
        .nt-mb-retry:focus-visible {
            background: rgba(128, 128, 128, 0.18);
        }
        .nt-mb-external-link img {
            display: block;
            width: 18px;
            height: 18px;
            border-radius: 3px;
        }
        .nt-mb-retry {
            font: 700 14px/18px sans-serif;
        }
    `;
      document.head.append(style);
    }
    function init() {
      addStyles();
      scan();
      let scanPending = false;
      const scheduleScan = () => {
        if (scanPending) {
          return;
        }
        scanPending = true;
        queueMicrotask(() => {
          scanPending = false;
          scan();
        });
      };
      new MutationObserver(scheduleScan).observe(document.body, {
        attributeFilter: ['href'],
        attributes: true,
        childList: true,
        subtree: true
      });
      window.addEventListener('hashchange', scheduleScan);
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init, {
        once: true
      });
    } else {
      init();
    }

})();
