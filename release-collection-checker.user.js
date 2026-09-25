// ==UserScript==
// @name         Release Collection Checker
// @description  Marks releases on supported music sites that are already present in your personal collection.
// @version      2026.09.25.3
// @author       
// @namespace    https://github.com/augmente000/nt-userscripts
// @downloadURL  https://raw.githubusercontent.com/augmente000/nt-userscripts/dist/release-collection-checker.user.js
// @updateURL    https://raw.githubusercontent.com/augmente000/nt-userscripts/dist/release-collection-checker.user.js
// @match        https://band.codes/*
// @connect      api.new-team.me
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// @icon         https://band.codes/favicon.ico
// ==/UserScript==

(function () {
    'use strict';

    const API_URL = 'https://api.new-team.me/api/v1/releases';
    const CMS_URL = 'https://cms.new-team.me/releases';
    const API_TOKEN_STORAGE_KEY = 'releaseCollectionCheckerApiToken';
    function isRecord$1(value) {
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    }
    class ApiAuthenticationError extends Error {}
    class CmsClient {
      setupDismissed = false;
      configureToken() {
        const hasSavedToken = Boolean(GM_getValue(API_TOKEN_STORAGE_KEY, '').trim());
        const promptMessage = hasSavedToken ? 'Enter a new CMS API token. Cancel to keep the saved token.' : 'Enter the CMS API token used to check your collection:';
        const enteredToken = window.prompt(promptMessage);
        if (enteredToken === null) {
          return null;
        }
        const token = enteredToken.trim();
        if (!token) {
          window.alert('An API token is required. The saved token was not changed.');
          return null;
        }
        GM_setValue(API_TOKEN_STORAGE_KEY, token);
        this.setupDismissed = false;
        return token;
      }
      async findRelease(externalUrl) {
        const token = this.getToken();
        if (!token) {
          return null;
        }
        return this.requestRelease(externalUrl, token);
      }
      getEditUrl(release) {
        return `${CMS_URL}/${encodeURIComponent(release.id)}/edit`;
      }
      getToken() {
        const storedToken = GM_getValue(API_TOKEN_STORAGE_KEY, '').trim();
        if (storedToken) {
          return storedToken;
        }
        if (this.setupDismissed) {
          return null;
        }
        const token = this.configureToken();
        this.setupDismissed = token === null;
        return token;
      }
      requestRelease(externalUrl, token) {
        const url = new URL(API_URL);
        url.searchParams.set('externalUrl', externalUrl);
        return new Promise((resolve, reject) => {
          GM_xmlhttpRequest({
            method: 'GET',
            url: url.href,
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json'
            },
            responseType: 'text',
            timeout: 30_000,
            onload: response => {
              if (response.status === 401 || response.status === 403) {
                reject(new ApiAuthenticationError('The CMS API rejected the saved token.'));
                return;
              }
              if (response.status < 200 || response.status >= 300) {
                reject(new Error(`CMS API request failed with HTTP ${response.status}.`));
                return;
              }
              try {
                const responseText = typeof response.responseText === 'string' ? response.responseText : '';
                const payload = JSON.parse(responseText);
                if (!isRecord$1(payload) || !Array.isArray(payload['data'])) {
                  throw new Error('The CMS API returned an unexpected response.');
                }
                const firstRelease = payload['data'][0];
                if (firstRelease === undefined) {
                  resolve(null);
                  return;
                }
                if (!isRecord$1(firstRelease) || typeof firstRelease['id'] !== 'string') {
                  throw new Error('The CMS API returned a release without an id.');
                }
                resolve({
                  id: firstRelease['id']
                });
              } catch (error) {
                reject(error);
              }
            },
            onerror: () => reject(new Error('The CMS API request failed.')),
            onabort: () => reject(new Error('The CMS API request was aborted.')),
            ontimeout: () => reject(new Error('The CMS API request timed out.'))
          });
        });
      }
    }

    class TaskQueue {
      activeTasks = 0;
      pendingTasks = [];
      constructor(concurrency) {
        this.concurrency = concurrency;
      }
      run(task) {
        return new Promise((resolve, reject) => {
          const start = () => {
            this.activeTasks += 1;
            task().then(resolve, reject).finally(() => {
              this.activeTasks -= 1;
              this.startNext();
            });
          };
          this.pendingTasks.push(start);
          this.startNext();
        });
      }
      startNext() {
        while (this.activeTasks < this.concurrency) {
          const start = this.pendingTasks.shift();
          if (!start) {
            return;
          }
          start();
        }
      }
    }

    const MATCH_CLASS = 'release-collection-checker-match';
    const MARKER_CLASS = 'release-collection-checker-marker';
    function markReleaseInCollection(element, editUrl) {
      if (element.querySelector(`.${MARKER_CLASS}`)) {
        return;
      }
      element.classList.add(MATCH_CLASS);
      const marker = document.createElement('a');
      marker.className = MARKER_CLASS;
      marker.href = editUrl;
      marker.target = '_blank';
      marker.rel = 'noopener noreferrer';
      marker.title = 'Open this release in the CMS';
      marker.setAttribute('aria-label', 'Already in your collection. Open this release in the CMS.');
      marker.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.25 4.25L19 7" /></svg>';
      element.append(marker);
    }
    function clearCollectionMarkers() {
      for (const element of document.querySelectorAll(`.${MATCH_CLASS}`)) {
        element.classList.remove(MATCH_CLASS);
      }
      for (const marker of document.querySelectorAll(`.${MARKER_CLASS}`)) {
        marker.remove();
      }
    }
    function installCollectionMarkerStyles() {
      const style = document.createElement('style');
      style.textContent = `
        .${MATCH_CLASS} {
            outline: 2px solid #16a34a !important;
            outline-offset: -2px;
        }

        .${MARKER_CLASS} {
            align-items: center;
            background: #16a34a;
            border: 2px solid white;
            border-radius: 9999px;
            box-shadow: 0 1px 5px rgb(0 0 0 / 45%);
            color: white;
            display: flex;
            height: 2rem;
            justify-content: center;
            position: absolute;
            right: 0.5rem;
            top: 0.5rem;
            width: 2rem;
            z-index: 20;
        }

        .${MARKER_CLASS}:hover {
            background: #15803d;
            transform: scale(1.08);
        }

        .${MARKER_CLASS}:focus-visible {
            outline: 3px solid white;
            outline-offset: 2px;
        }

        .${MARKER_CLASS} svg {
            fill: none;
            height: 1.25rem;
            stroke: currentColor;
            stroke-linecap: round;
            stroke-linejoin: round;
            stroke-width: 3;
            width: 1.25rem;
        }
    `;
      document.head.append(style);
    }

    const MAX_CONCURRENT_CHECKS = 4;
    const SCAN_DELAY_MS = 100;
    class CollectionChecker {
      authenticationWarningShown = false;
      generation = 0;
      lookupTasks = new Map();
      processedElements = new WeakSet();
      scanScheduled = false;
      taskQueue = new TaskQueue(MAX_CONCURRENT_CHECKS);
      constructor(adapter, cmsClient) {
        this.adapter = adapter;
        this.cmsClient = cmsClient;
      }
      reset() {
        this.generation += 1;
        this.lookupTasks.clear();
        this.processedElements = new WeakSet();
        this.authenticationWarningShown = false;
        clearCollectionMarkers();
        this.scan();
      }
      start() {
        const observer = new MutationObserver(() => this.scheduleScan());
        observer.observe(document.body, {
          childList: true,
          subtree: true
        });
        this.scan();
      }
      checkRelease(release) {
        this.processedElements.add(release.element);
        const checkGeneration = this.generation;
        void this.getLookup(release).then(cmsRelease => {
          if (!cmsRelease || checkGeneration !== this.generation || !release.element.isConnected) {
            return;
          }
          markReleaseInCollection(release.element, this.cmsClient.getEditUrl(cmsRelease));
        }).catch(error => {
          if (checkGeneration !== this.generation) {
            return;
          }
          console.error(`Release Collection Checker: failed to check ${release.key}`, error);
          if (error instanceof ApiAuthenticationError && !this.authenticationWarningShown) {
            this.authenticationWarningShown = true;
            window.alert('The CMS API rejected the saved token. Use the userscript menu to update it.');
          }
        });
      }
      getLookup(release) {
        const existingTask = this.lookupTasks.get(release.key);
        if (existingTask) {
          return existingTask;
        }
        const task = this.taskQueue.run(async () => {
          const externalUrl = await release.getExternalUrl();
          if (!externalUrl) {
            console.warn(`Release Collection Checker: no external release URL found for ${release.key}`);
            return null;
          }
          return this.cmsClient.findRelease(externalUrl);
        });
        this.lookupTasks.set(release.key, task);
        return task;
      }
      scan() {
        for (const release of this.adapter.findReleases(document)) {
          if (!this.processedElements.has(release.element)) {
            this.checkRelease(release);
          }
        }
      }
      scheduleScan() {
        if (this.scanScheduled) {
          return;
        }
        this.scanScheduled = true;
        window.setTimeout(() => {
          this.scanScheduled = false;
          this.scan();
        }, SCAN_DELAY_MS);
      }
    }

    const BANDCAMP_RELEASE_URL_PATTERN = /https?:\/\/[^\s"'\\<>]+\.bandcamp\.com\/(?:album|track)\/[^\s"'\\<>]+/giu;
    const JSON_LD_SCRIPT_PATTERN = /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/giu;
    function isRecord(value) {
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    }
    function normalizeBandcampReleaseUrl(value) {
      if (typeof value !== 'string') {
        return null;
      }
      const unescapedValue = value.replaceAll('\\/', '/').replaceAll('&amp;', '&');
      try {
        const url = new URL(unescapedValue);
        const isBandcampHost = url.hostname === 'bandcamp.com' || url.hostname.endsWith('.bandcamp.com');
        const isReleasePath = /^\/(?:album|track)\/[^/]+/u.test(url.pathname);
        if (!isBandcampHost || !isReleasePath) {
          return null;
        }
        url.hash = '';
        return url.href;
      } catch {
        return null;
      }
    }
    function findReleaseUrlInStructuredData(value) {
      if (Array.isArray(value)) {
        for (const item of value) {
          const url = findReleaseUrlInStructuredData(item);
          if (url) {
            return url;
          }
        }
        return null;
      }
      if (!isRecord(value)) {
        return null;
      }
      const directCandidates = [value['bandcampUrl']];
      const potentialAction = value['potentialAction'];
      if (isRecord(potentialAction)) {
        directCandidates.push(potentialAction['target']);
      }
      for (const candidate of directCandidates) {
        const url = normalizeBandcampReleaseUrl(candidate);
        if (url) {
          return url;
        }
      }
      for (const child of Object.values(value)) {
        const url = findReleaseUrlInStructuredData(child);
        if (url) {
          return url;
        }
      }
      return null;
    }
    function extractBandcampReleaseUrl(html) {
      for (const match of html.matchAll(JSON_LD_SCRIPT_PATTERN)) {
        const scriptContents = match[1];
        if (!scriptContents) {
          continue;
        }
        try {
          const url = findReleaseUrlInStructuredData(JSON.parse(scriptContents));
          if (url) {
            return url;
          }
        } catch {
          // Fall through to the URL scan. Next.js also embeds the release URL in its payload.
        }
      }
      const normalizedHtml = html.replaceAll('\\/', '/');
      for (const match of normalizedHtml.matchAll(BANDCAMP_RELEASE_URL_PATTERN)) {
        const url = normalizeBandcampReleaseUrl(match[0]);
        if (url) {
          return url;
        }
      }
      return null;
    }

    class PersistentCache {
      values;
      constructor(storageKey, isValue) {
        this.storageKey = storageKey;
        this.isValue = isValue;
        this.values = this.load();
      }
      delete(key) {
        delete this.values[key];
        this.save();
      }
      get(key) {
        return this.values[key];
      }
      set(key, value) {
        this.values[key] = value;
        this.save();
      }
      load() {
        try {
          const storedValue = localStorage.getItem(this.storageKey);
          if (!storedValue) {
            return {};
          }
          const parsedValue = JSON.parse(storedValue);
          if (typeof parsedValue !== 'object' || parsedValue === null || Array.isArray(parsedValue)) {
            return {};
          }
          return Object.fromEntries(Object.entries(parsedValue).filter(([, value]) => this.isValue(value)));
        } catch (error) {
          console.warn(`Release Collection Checker: could not read cache ${this.storageKey}.`, error);
          return {};
        }
      }
      save() {
        try {
          localStorage.setItem(this.storageKey, JSON.stringify(this.values));
        } catch (error) {
          console.warn(`Release Collection Checker: could not save cache ${this.storageKey}.`, error);
        }
      }
    }

    const BANDCAMP_URL_CACHE_KEY = 'nt-bandcodes-collection-checker:bandcamp-urls:v1';
    const FAILED_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
    const CARD_SELECTOR = 'div.group.border';
    function isBandcampUrlCacheEntry(value) {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
      }
      const entry = value;
      return (typeof entry['bandcampUrl'] === 'string' || entry['bandcampUrl'] === null) && typeof entry['cachedAt'] === 'number';
    }
    const bandcampUrlCache = new PersistentCache(BANDCAMP_URL_CACHE_KEY, isBandcampUrlCacheEntry);
    function getCachedBandcampUrl(releasePageUrl) {
      const entry = bandcampUrlCache.get(releasePageUrl);
      if (!entry) {
        return undefined;
      }
      if (entry.bandcampUrl === null && Date.now() - entry.cachedAt >= FAILED_CACHE_TTL_MS) {
        bandcampUrlCache.delete(releasePageUrl);
        return undefined;
      }
      return entry.bandcampUrl;
    }
    async function getBandcampUrl(releasePageUrl) {
      const cachedUrl = getCachedBandcampUrl(releasePageUrl);
      if (cachedUrl !== undefined) {
        return cachedUrl;
      }
      const response = await fetch(releasePageUrl, {
        credentials: 'same-origin',
        headers: {
          Accept: 'text/html'
        }
      });
      if (!response.ok) {
        throw new Error(`Band.codes release request failed with HTTP ${response.status}.`);
      }
      const bandcampUrl = extractBandcampReleaseUrl(await response.text());
      bandcampUrlCache.set(releasePageUrl, {
        bandcampUrl,
        cachedAt: Date.now()
      });
      return bandcampUrl;
    }
    function findReleases(document) {
      const releases = [];
      for (const heading of document.querySelectorAll('a[href] > h3')) {
        const anchor = heading.parentElement;
        const card = heading.closest(CARD_SELECTOR);
        if (!(anchor instanceof HTMLAnchorElement) || !card) {
          continue;
        }
        const releaseUrl = new URL(anchor.href, window.location.href);
        const pathSegments = releaseUrl.pathname.split('/').filter(Boolean);
        if (releaseUrl.origin !== window.location.origin || pathSegments.length !== 2) {
          continue;
        }
        releaseUrl.hash = '';
        releaseUrl.search = '';
        const releasePageUrl = releaseUrl.href;
        releases.push({
          element: card,
          getExternalUrl: () => getBandcampUrl(releasePageUrl),
          key: releasePageUrl
        });
      }
      return releases;
    }
    const bandcodesAdapter = {
      id: 'bandcodes',
      matches: url => url.hostname === 'band.codes',
      findReleases
    };

    const SITE_ADAPTERS = [bandcodesAdapter];
    function main() {
      const currentUrl = new URL(window.location.href);
      const adapter = SITE_ADAPTERS.find(candidate => candidate.matches(currentUrl));
      if (!adapter) {
        return;
      }
      installCollectionMarkerStyles();
      const cmsClient = new CmsClient();
      const checker = new CollectionChecker(adapter, cmsClient);
      GM_registerMenuCommand('Edit CMS API token', () => {
        if (!cmsClient.configureToken()) {
          return;
        }
        checker.reset();
      });
      checker.start();
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', main, {
        once: true
      });
    } else {
      main();
    }

})();
