// ==UserScript==
// @name         Bandcamp Collection Downloader
// @description  Downloads free and purchased Bandcamp releases as zipped FLAC, with batch progress on discography pages.
// @version      1.0.1
// @author       
// @namespace    https://github.com/jrm/bandcamp-collection-downloader
// @downloadURL  https://github.com/jrm/bandcamp-collection-downloader/raw/master/dist/collection_downloader.user.js
// @updateURL    https://github.com/jrm/bandcamp-collection-downloader/raw/master/dist/collection_downloader.user.js
// @match        https://bandcamp.com/*
// @match        https://*.bandcamp.com/*
// @connect      bandcamp.com
// @connect      *.bandcamp.com
// @connect      *.bcbits.com
// @connect      api.guerrillamail.com
// @connect      guerrillamail.com
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// @icon         https://s4.bcbits.com/img/favicon/favicon-32x32.png
// ==/UserScript==

(function () {
    'use strict';

    const BINARY_CHUNK_SIZE = 8 * 1_048_576;
    class HttpError extends Error {
      status;
      constructor(message, status) {
        super(message);
        this.name = 'HttpError';
        this.status = status;
      }
    }
    function abortError(signal) {
      if (signal?.reason instanceof Error) {
        return signal.reason;
      }
      return new DOMException('Download stopped', 'AbortError');
    }
    function request(url, options = {}) {
      return new Promise((resolve, reject) => {
        if (options.signal?.aborted) {
          reject(abortError(options.signal));
          return;
        }
        let settled = false;
        let handle;
        const cleanup = () => options.signal?.removeEventListener('abort', abort);
        const resolveOnce = response => {
          if (settled) {
            return;
          }
          settled = true;
          cleanup();
          resolve(response);
        };
        const rejectOnce = error => {
          if (settled) {
            return;
          }
          settled = true;
          cleanup();
          reject(error);
        };
        const abort = () => {
          try {
            handle?.abort();
          } finally {
            rejectOnce(abortError(options.signal));
          }
        };
        options.signal?.addEventListener('abort', abort, {
          once: true
        });
        handle = GM_xmlhttpRequest({
          data: options.data,
          headers: options.headers,
          method: options.method ?? 'GET',
          onabort: () => rejectOnce(abortError(options.signal)),
          onerror: response => rejectOnce(options.signal?.aborted ? abortError(options.signal) : new HttpError(`Network request failed for ${url}`, response.status)),
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
                total: response.total
              });
            }
            resolveOnce({
              body: response.response ?? response.responseText,
              finalUrl: response.finalUrl || url,
              headers: response.responseHeaders,
              status: response.status
            });
          },
          onprogress: response => {
            options.onProgress?.(response.loaded, response.lengthComputable ? response.total : null);
          },
          ontimeout: () => rejectOnce(new Error(`Request timed out: ${url}`)),
          ...(options.overrideMimeType ? {
            overrideMimeType: options.overrideMimeType
          } : {}),
          responseType: options.responseType ?? 'text',
          timeout: options.timeout ?? 45_000,
          url
        });
        if (options.signal?.aborted) {
          abort();
        }
      });
    }
    async function requestText(url, options = {}) {
      const response = await request(url, {
        ...options,
        responseType: 'text'
      });
      if (typeof response.body !== 'string') {
        throw new Error(`Expected a text response from ${url}`);
      }
      return response.body;
    }
    async function requestJson(url, options = {}) {
      const text = await requestText(url, options);
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`Invalid JSON response from ${url}`);
      }
    }
    function headerValue(headers, name) {
      const prefix = `${name.toLowerCase()}:`;
      const line = headers.split(/\r?\n/).find(candidate => candidate.toLowerCase().startsWith(prefix));
      return line ? line.slice(line.indexOf(':') + 1).trim() : null;
    }
    function contentDispositionFileName(value) {
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
    async function requestBinaryChunked(url, onProgress, signal) {
      const chunks = [];
      let contentType = null;
      let fileName = null;
      let loaded = 0;
      let total = null;
      while (total === null || loaded < total) {
        const rangeEnd = loaded + BINARY_CHUNK_SIZE - 1;
        const chunkOffset = loaded;
        const response = await request(url, {
          headers: {
            Range: `bytes=${chunkOffset}-${rangeEnd}`
          },
          onProgress: chunkLoaded => {
            onProgress?.(chunkOffset + chunkLoaded, total);
          },
          overrideMimeType: 'text/plain; charset=x-user-defined',
          responseType: 'text',
          ...(signal ? {
            signal
          } : {}),
          timeout: 0
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
      return {
        body: body.buffer,
        contentType,
        fileName
      };
    }
    async function normalizeBinaryBody(value, url) {
      if (typeof value === 'string') {
        const body = new Uint8Array(value.length);
        for (let index = 0; index < value.length; index += 1) {
          body[index] = value.charCodeAt(index) & 0xff;
        }
        return body.buffer;
      }
      if (Object.prototype.toString.call(value) === '[object ArrayBuffer]') {
        return new Uint8Array(value).slice().buffer;
      }
      if (ArrayBuffer.isView(value)) {
        return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice().buffer;
      }
      if (Object.prototype.toString.call(value) === '[object Blob]' && typeof value.arrayBuffer === 'function') {
        return value.arrayBuffer();
      }
      const tag = Object.prototype.toString.call(value);
      throw new Error(`Expected a binary response from ${url} (received ${tag})`);
    }
    function formEncode(values) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(values)) {
        params.set(key, String(value));
      }
      return params.toString();
    }
    function sleep(milliseconds, signal) {
      return new Promise((resolve, reject) => {
        if (signal?.aborted) {
          reject(abortError(signal));
          return;
        }
        const finish = () => {
          signal?.removeEventListener('abort', abort);
          resolve();
        };
        const timeout = window.setTimeout(finish, milliseconds);
        const abort = () => {
          window.clearTimeout(timeout);
          signal?.removeEventListener('abort', abort);
          reject(abortError(signal));
        };
        signal?.addEventListener('abort', abort, {
          once: true
        });
      });
    }

    function detectPage(location = window.location) {
      const path = location.pathname.replace(/\/+$/, '') || '/';
      if (path === '/music') {
        return 'discography';
      }
      if (/^\/(album|track)\/[^/]+$/.test(path)) {
        return 'release';
      }
      return 'unsupported';
    }
    function isRecord(value) {
      return typeof value === 'object' && value !== null;
    }
    function parseJson(value, description) {
      try {
        return JSON.parse(value);
      } catch {
        throw new Error(`Could not parse ${description}`);
      }
    }
    function normalizeReleaseUrl(url, baseUrl) {
      return new URL(url, baseUrl).href;
    }
    function visibleGridItem(element) {
      if (element.hidden || element.style.display === 'none') {
        return false;
      }
      return !element.getAttribute('style')?.replace(/\s/g, '').includes('display:none');
    }
    function discoverReleases(document, pageUrl) {
      const releases = new Map();
      const grid = document.querySelector('ol#music-grid');
      if (!grid) {
        return [];
      }
      for (const item of grid.querySelectorAll('li')) {
        if (!visibleGridItem(item)) {
          continue;
        }
        const anchor = item.querySelector('a[href*="/album/"], a[href*="/track/"]');
        if (!anchor) {
          continue;
        }
        const url = normalizeReleaseUrl(anchor.getAttribute('href') ?? anchor.href, pageUrl);
        const title = item.querySelector('.title')?.textContent?.trim() || anchor.getAttribute('title')?.trim() || anchor.textContent?.trim() || 'Untitled release';
        releases.set(url, {
          title,
          url
        });
      }
      const clientItems = grid.dataset['clientItems'];
      if (clientItems) {
        const parsed = parseJson(clientItems, 'discography client items');
        if (Array.isArray(parsed)) {
          for (const candidate of parsed) {
            if (!isRecord(candidate)) {
              continue;
            }
            const item = candidate;
            if (item.filtered || typeof item.page_url !== 'string' || item.type !== 'album' && item.type !== 'track') {
              continue;
            }
            const url = normalizeReleaseUrl(item.page_url, pageUrl);
            releases.set(url, {
              title: typeof item.title === 'string' ? item.title : 'Untitled release',
              url
            });
          }
        }
      }
      return [...releases.values()];
    }
    function releaseType(value) {
      return value === 'album' || value === 'track' ? value : null;
    }
    function parseTralbum(document) {
      const element = document.querySelector('script[data-tralbum]');
      const value = element?.getAttribute('data-tralbum');
      if (!value) {
        throw new Error('This page has no Bandcamp release data');
      }
      const parsed = parseJson(value, 'Bandcamp release data');
      if (!isRecord(parsed) || !isRecord(parsed['current'])) {
        throw new Error('Bandcamp returned malformed release data');
      }
      const current = parsed['current'];
      const type = releaseType(current['type']);
      const currentId = Number(current['id']);
      const id = Number(parsed['id']);
      if (!type || !Number.isInteger(currentId) || currentId <= 0 || !Number.isInteger(id) || id <= 0) {
        throw new Error('Bandcamp release data is missing an item identifier');
      }
      return {
        current: {
          id: currentId,
          title: typeof current['title'] === 'string' ? current['title'] : 'Untitled release',
          type
        },
        freeDownloadPage: typeof parsed['freeDownloadPage'] === 'string' && parsed['freeDownloadPage'] ? parsed['freeDownloadPage'] : null,
        hasAudio: parsed['hasAudio'] === true,
        id,
        is_purchased: parsed['is_purchased'] === true,
        item_type: typeof parsed['item_type'] === 'string' ? parsed['item_type'] : type,
        url: typeof parsed['url'] === 'string' ? parsed['url'] : window.location.href,
        ...(typeof parsed['art_id'] === 'number' ? {
          art_id: parsed['art_id']
        } : {})
      };
    }
    function jsonLdDocuments(document) {
      const values = [];
      for (const script of document.querySelectorAll('head > script[type="application/ld+json"]')) {
        if (!script.textContent?.trim()) {
          continue;
        }
        try {
          values.push(JSON.parse(script.textContent));
        } catch {
          // Other JSON-LD blocks are not required for download resolution.
        }
      }
      return values;
    }
    function numericOfferPrice(value) {
      if (!isRecord(value)) {
        return null;
      }
      const offers = value['offers'];
      const candidates = Array.isArray(offers) ? offers : [offers];
      for (const offer of candidates) {
        if (!isRecord(offer)) {
          continue;
        }
        const rawPrice = offer['price'];
        if (typeof rawPrice !== 'number' && (typeof rawPrice !== 'string' || rawPrice.trim() === '')) {
          continue;
        }
        const price = Number(rawPrice);
        if (Number.isFinite(price)) {
          return price;
        }
      }
      return null;
    }
    function releaseOfferPrice(jsonLd) {
      if (Array.isArray(jsonLd)) {
        for (const item of jsonLd) {
          const price = releaseOfferPrice(item);
          if (price !== null) {
            return price;
          }
        }
        return null;
      }
      if (!isRecord(jsonLd)) {
        return null;
      }
      const headId = typeof jsonLd['@id'] === 'string' ? jsonLd['@id'] : null;
      const container = isRecord(jsonLd['inAlbum']) ? jsonLd['inAlbum'] : jsonLd;
      const releases = Array.isArray(container['albumRelease']) ? container['albumRelease'] : [container['albumRelease']];
      const matching = releases.find(candidate => isRecord(candidate) && headId !== null && candidate['@id'] === headId);
      const exactPrice = numericOfferPrice(matching);
      if (exactPrice !== null) {
        return exactPrice;
      }
      return numericOfferPrice(jsonLd);
    }
    function artistName(jsonLd) {
      if (Array.isArray(jsonLd)) {
        for (const item of jsonLd) {
          const artist = artistName(item);
          if (artist) {
            return artist;
          }
        }
        return null;
      }
      if (!isRecord(jsonLd)) {
        return null;
      }
      const artist = jsonLd['byArtist'];
      if (isRecord(artist) && typeof artist['name'] === 'string') {
        return artist['name'];
      }
      return null;
    }
    function originalArtworkUrl(url, baseUrl) {
      const parsed = new URL(url, baseUrl);
      if ((parsed.hostname === 'bcbits.com' || parsed.hostname.endsWith('.bcbits.com')) && /\/a\d+_\d+\.[a-z0-9]+$/i.test(parsed.pathname)) {
        parsed.pathname = parsed.pathname.replace(/_\d+(?=\.[a-z0-9]+$)/i, '_0');
      }
      return parsed.href;
    }
    function artworkUrl(document, tralbum, jsonLd) {
      for (const data of jsonLd) {
        if (isRecord(data)) {
          const image = data['image'];
          if (typeof image === 'string') {
            return originalArtworkUrl(image, tralbum.url);
          }
          if (isRecord(image) && typeof image['url'] === 'string') {
            return originalArtworkUrl(image['url'], tralbum.url);
          }
          if (Array.isArray(image)) {
            const candidate = image.find(value => typeof value === 'string');
            if (typeof candidate === 'string') {
              return originalArtworkUrl(candidate, tralbum.url);
            }
          }
        }
      }
      const socialImage = document.querySelector('meta[property="og:image"]')?.content;
      if (socialImage) {
        return originalArtworkUrl(socialImage, tralbum.url);
      }
      return tralbum.art_id ? `https://f4.bcbits.com/img/a${tralbum.art_id}_0.jpg` : null;
    }
    function fanId(document) {
      const raw = document.querySelector('script[data-tralbum-collect-info]')?.getAttribute('data-tralbum-collect-info');
      if (!raw) {
        return null;
      }
      const parsed = parseJson(raw, 'Bandcamp collection data');
      if (!isRecord(parsed)) {
        return null;
      }
      const id = Number(parsed['fan_id']);
      return Number.isInteger(id) && id > 0 ? id : null;
    }
    function paymentDownloadPage(document, pageUrl) {
      const raw = document.querySelector('[data-payment]')?.dataset['payment'];
      if (!raw) {
        return null;
      }
      const parsed = parseJson(raw, 'Bandcamp payment data');
      if (!isRecord(parsed) || typeof parsed['paymentDownloadPage'] !== 'string' || !parsed['paymentDownloadPage']) {
        return null;
      }
      return normalizeReleaseUrl(parsed['paymentDownloadPage'], pageUrl);
    }
    function parseReleaseDocument(document, pageUrl) {
      const tralbum = parseTralbum(document);
      const jsonLd = jsonLdDocuments(document);
      return {
        artworkUrl: artworkUrl(document, tralbum, jsonLd),
        artist: jsonLd.map(artistName).find(value => Boolean(value)) ?? document.querySelector('meta[property="og:site_name"]')?.content ?? new URL(pageUrl).hostname.split('.')[0] ?? 'Bandcamp',
        document,
        fanId: fanId(document),
        isFree: jsonLd.some(data => releaseOfferPrice(data) === 0),
        paymentDownloadPage: paymentDownloadPage(document, pageUrl),
        title: tralbum.current.title,
        tralbum,
        url: pageUrl
      };
    }
    async function fetchRelease(url, signal) {
      const html = await requestText(url, signal ? {
        signal
      } : {});
      const document = new DOMParser().parseFromString(html, 'text/html');
      return parseReleaseDocument(document, url);
    }
    function normalizeCookedUrl(url, baseUrl = 'https://bandcamp.com/') {
      return new URL(url, baseUrl).href;
    }
    function parseCookedDownloadPage(html) {
      const document = new DOMParser().parseFromString(html, 'text/html');
      const blob = document.querySelector('#pagedata[data-blob]')?.dataset['blob'];
      if (!blob) {
        throw new Error('Bandcamp download page contains no download data');
      }
      const parsed = parseJson(blob, 'Bandcamp download data');
      const item = parsed.digital_items?.[0];
      const flacUrl = item?.downloads?.['flac']?.url;
      const itemId = Number(item?.item_id);
      const itemType = releaseType(item?.type);
      if (!flacUrl || !Number.isInteger(itemId) || itemId <= 0 || !itemType) {
        throw new Error('Zipped FLAC is unavailable for this release');
      }
      return {
        flacUrl: normalizeCookedUrl(flacUrl),
        itemId,
        itemType
      };
    }
    async function fetchCookedDownload(url, signal) {
      return parseCookedDownloadPage(await requestText(normalizeCookedUrl(url), signal ? {
        signal
      } : {}));
    }
    async function resolvePurchasedDownload(release, signal) {
      if (release.fanId === null) {
        throw new Error('Bandcamp did not expose the logged-in fan ID');
      }
      const response = await requestJson('https://bandcamp.com/api/fancollection/1/search_items', {
        data: JSON.stringify({
          fan_id: release.fanId,
          search_key: release.tralbum.current.title,
          search_type: 'collection'
        }),
        headers: {
          'Content-Type': 'application/json'
        },
        method: 'POST',
        ...(signal ? {
          signal
        } : {})
      });
      const wantedType = release.tralbum.item_type[0] ?? release.tralbum.current.type[0];
      const match = response.tralbums?.find(item => item.tralbum_type === wantedType && item.tralbum_id === release.tralbum.id);
      if (!match || !match.sale_item_type || match.sale_item_id === undefined) {
        throw new Error('Could not find this release in the Bandcamp collection');
      }
      const saleId = `${match.sale_item_type}${match.sale_item_id}`;
      const cookedUrl = response.redownload_urls?.[saleId];
      if (!cookedUrl) {
        throw new Error('Bandcamp did not return a redownload URL for this release');
      }
      return normalizeCookedUrl(cookedUrl);
    }
    function classifyRelease(release) {
      if (release.paymentDownloadPage) {
        return 'previous-download';
      }
      if (release.tralbum.freeDownloadPage) {
        return 'direct-free';
      }
      if (release.isFree) {
        return 'email-gated';
      }
      if (release.tralbum.is_purchased) {
        return 'purchased';
      }
      return 'unavailable';
    }

    const API_URL = 'https://api.guerrillamail.com/ajax.php';
    const POLL_INTERVAL_MS = 5_000;
    const EMAIL_TIMEOUT_MS = 180_000;
    function releaseKey(type, id) {
      return `${type}:${id}`;
    }
    function decodeHtmlText(value) {
      const element = document.createElement('textarea');
      element.innerHTML = value;
      return element.value;
    }
    function downloadLinks(body) {
      const parsed = new DOMParser().parseFromString(body, 'text/html');
      const links = [...parsed.querySelectorAll('a[href]')].map(anchor => anchor.href).filter(url => {
        try {
          const parsedUrl = new URL(url);
          return (parsedUrl.hostname === 'bandcamp.com' || parsedUrl.hostname.endsWith('.bandcamp.com')) && parsedUrl.pathname === '/download';
        } catch {
          return false;
        }
      });
      if (links.length > 0) {
        return [...new Set(links)];
      }
      const decoded = decodeHtmlText(body);
      return [...new Set(decoded.match(/https?:\/\/(?:[^\s"'<>]+\.)?bandcamp\.com\/download\?[^\s"'<>]+/gi) ?? [])];
    }
    class GuerrillaInbox {
      addressPromise = null;
      downloads = new Map();
      nextPollAt = 0;
      pollPromise = null;
      seenMessages = new Set();
      sessionToken = null;
      constructor(signal) {
        this.signal = signal;
      }
      api(functionName, parameters = {}) {
        const url = new URL(API_URL);
        url.searchParams.set('f', functionName);
        url.searchParams.set('ip', '127.0.0.1');
        url.searchParams.set('agent', navigator.userAgent.slice(0, 160));
        if (this.sessionToken) {
          url.searchParams.set('sid_token', this.sessionToken);
        }
        for (const [key, value] of Object.entries(parameters)) {
          url.searchParams.set(key, String(value));
        }
        return requestJson(url.href, this.signal ? {
          signal: this.signal
        } : {});
      }
      getAddress() {
        this.addressPromise ??= this.api('get_email_address', {
          lang: 'en'
        }).then(response => {
          if (!response.email_addr) {
            throw new Error('Guerrilla Mail did not return a temporary address');
          }
          this.sessionToken = response.sid_token ?? null;
          return response.email_addr;
        });
        return this.addressPromise;
      }
      async requestDownloadEmail(release) {
        const address = await this.getAddress();
        const response = await requestJson(new URL('/email_download', release.url).href, {
          data: formEncode({
            address,
            country: 'United States',
            encoding_name: 'none',
            item_id: release.tralbum.current.id,
            item_type: release.tralbum.current.type,
            postcode: '00000'
          }),
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          method: 'POST',
          ...(this.signal ? {
            signal: this.signal
          } : {})
        });
        if (response.ok !== true) {
          throw new Error('Bandcamp rejected the temporary email address');
        }
      }
      async doPoll() {
        const delay = this.nextPollAt - Date.now();
        if (delay > 0) {
          await sleep(delay, this.signal);
        }
        this.nextPollAt = Date.now() + POLL_INTERVAL_MS;
        const response = await this.api('check_email', {
          seq: 0
        });
        for (const message of response.list ?? []) {
          const id = message.mail_id === undefined ? null : String(message.mail_id);
          if (!id || this.seenMessages.has(id)) {
            continue;
          }
          const sender = decodeHtmlText(message.mail_from ?? '').toLowerCase();
          const subject = decodeHtmlText(message.mail_subject ?? '').toLowerCase();
          if (!sender.includes('noreply@bandcamp.com') || !subject.includes('download')) {
            this.seenMessages.add(id);
            continue;
          }
          const email = await this.api('fetch_email', {
            email_id: id
          });
          const links = downloadLinks(email.mail_body ?? '');
          let resolvedLink = false;
          for (const url of links) {
            try {
              const download = await fetchCookedDownload(url, this.signal);
              this.downloads.set(releaseKey(download.itemType, download.itemId), download);
              resolvedLink = true;
            } catch (error) {
              console.warn('[Bandcamp Collection Downloader] Ignoring unusable email link', error);
            }
          }
          if (links.length === 0 || resolvedLink) {
            this.seenMessages.add(id);
          }
        }
      }
      poll() {
        if (!this.pollPromise) {
          this.pollPromise = this.doPoll().finally(() => {
            this.pollPromise = null;
          });
        }
        return this.pollPromise;
      }
      async waitForDownload(release) {
        const key = releaseKey(release.tralbum.current.type, release.tralbum.current.id);
        const deadline = Date.now() + EMAIL_TIMEOUT_MS;
        let lastPollError = null;
        while (Date.now() < deadline) {
          if (this.signal?.aborted) {
            throw abortError(this.signal);
          }
          const available = this.downloads.get(key);
          if (available) {
            this.downloads.delete(key);
            return available;
          }
          try {
            await this.poll();
            lastPollError = null;
          } catch (error) {
            lastPollError = error;
            console.warn('[Bandcamp Collection Downloader] Email poll failed; retrying', error);
          }
        }
        if (lastPollError instanceof Error) {
          throw new Error(`Timed out waiting for the Bandcamp download email: ${lastPollError.message}`);
        }
        throw new Error('Timed out waiting for the Bandcamp download email');
      }
    }

    const encoder = new TextEncoder();
    function crcTable() {
      const table = new Uint32Array(256);
      for (let index = 0; index < 256; index += 1) {
        let value = index;
        for (let bit = 0; bit < 8; bit += 1) {
          value = (value & 1) !== 0 ? 0xedb88320 ^ value >>> 1 : value >>> 1;
        }
        table[index] = value >>> 0;
      }
      return table;
    }
    const CRC_TABLE = crcTable();
    function crc32(data) {
      let crc = 0xffffffff;
      for (const byte of data) {
        crc = crc >>> 8 ^ (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0);
      }
      return (crc ^ 0xffffffff) >>> 0;
    }
    function dosTimestamp(date) {
      const year = Math.max(1980, date.getFullYear());
      return {
        date: year - 1980 << 9 | date.getMonth() + 1 << 5 | date.getDate(),
        time: date.getHours() << 11 | date.getMinutes() << 5 | date.getSeconds() >> 1
      };
    }
    function localHeader(entry, timestamp) {
      const output = new Uint8Array(30 + entry.name.length);
      const view = new DataView(output.buffer);
      view.setUint32(0, 0x04034b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 0x0800, true);
      view.setUint16(8, 0, true);
      view.setUint16(10, timestamp.time, true);
      view.setUint16(12, timestamp.date, true);
      view.setUint32(14, entry.crc, true);
      view.setUint32(18, entry.data.length, true);
      view.setUint32(22, entry.data.length, true);
      view.setUint16(26, entry.name.length, true);
      view.setUint16(28, 0, true);
      output.set(entry.name, 30);
      return output;
    }
    function centralHeader(entry, timestamp) {
      const output = new Uint8Array(46 + entry.name.length);
      const view = new DataView(output.buffer);
      view.setUint32(0, 0x02014b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 20, true);
      view.setUint16(8, 0x0800, true);
      view.setUint16(10, 0, true);
      view.setUint16(12, timestamp.time, true);
      view.setUint16(14, timestamp.date, true);
      view.setUint32(16, entry.crc, true);
      view.setUint32(20, entry.data.length, true);
      view.setUint32(24, entry.data.length, true);
      view.setUint16(28, entry.name.length, true);
      view.setUint16(30, 0, true);
      view.setUint16(32, 0, true);
      view.setUint16(34, 0, true);
      view.setUint16(36, 0, true);
      view.setUint32(38, 0, true);
      view.setUint32(42, entry.localOffset, true);
      output.set(entry.name, 46);
      return output;
    }
    function endRecord(entryCount, centralSize, centralOffset) {
      const output = new Uint8Array(22);
      const view = new DataView(output.buffer);
      view.setUint32(0, 0x06054b50, true);
      view.setUint16(4, 0, true);
      view.setUint16(6, 0, true);
      view.setUint16(8, entryCount, true);
      view.setUint16(10, entryCount, true);
      view.setUint32(12, centralSize, true);
      view.setUint32(16, centralOffset, true);
      view.setUint16(20, 0, true);
      return output;
    }
    function createZip(entries) {
      if (entries.length === 0 || entries.length > 0xffff) {
        throw new Error('ZIP must contain between 1 and 65535 files');
      }
      let localOffset = 0;
      const prepared = entries.map(entry => {
        const data = new Uint8Array(entry.data);
        const name = encoder.encode(entry.name);
        if (data.length > 0xffffffff || name.length > 0xffff) {
          throw new Error('A file is too large for a browser-created ZIP');
        }
        const preparedEntry = {
          crc: crc32(data),
          data,
          localOffset,
          name
        };
        localOffset += 30 + name.length + data.length;
        return preparedEntry;
      });
      if (localOffset > 0xffffffff) {
        throw new Error('The browser-created ZIP exceeds the 4 GiB ZIP limit');
      }
      const timestamp = dosTimestamp(new Date());
      const localParts = prepared.flatMap(entry => [localHeader(entry, timestamp), entry.data]);
      const centralParts = prepared.map(entry => centralHeader(entry, timestamp));
      const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
      const parts = [...localParts, ...centralParts, endRecord(prepared.length, centralSize, localOffset)];
      return new Blob(parts, {
        type: 'application/zip'
      });
    }

    function safeFileName(value) {
      const clean = value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').trim();
      return clean || 'Bandcamp download';
    }
    function releaseBaseName(release) {
      return safeFileName(`${release.artist} - ${release.title}`);
    }
    function extensionFromArtwork(response, url) {
      const contentType = response.contentType?.split(';')[0]?.trim().toLowerCase();
      const knownTypes = {
        'image/avif': 'avif',
        'image/gif': 'gif',
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp'
      };
      if (contentType && knownTypes[contentType]) {
        return knownTypes[contentType];
      }
      const extension = /\.([a-z0-9]{2,5})(?:$|[?#])/i.exec(url)?.[1]?.toLowerCase();
      return extension && ['avif', 'gif', 'jpeg', 'jpg', 'png', 'webp'].includes(extension) ? extension : 'jpg';
    }
    function browserSave(blob, name) {
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
    function gmDownload(url, name, onProgress, signal) {
      return new Promise((resolve, reject) => {
        if (signal.aborted) {
          reject(abortError(signal));
          return;
        }
        let settled = false;
        let handle;
        const cleanup = () => signal.removeEventListener('abort', abort);
        const resolveOnce = () => {
          if (settled) {
            return;
          }
          settled = true;
          cleanup();
          resolve();
        };
        const rejectOnce = error => {
          if (settled) {
            return;
          }
          settled = true;
          cleanup();
          reject(error);
        };
        const abort = () => {
          try {
            handle?.abort();
          } finally {
            rejectOnce(abortError(signal));
          }
        };
        signal.addEventListener('abort', abort, {
          once: true
        });
        handle = GM_download({
          name,
          onabort: () => rejectOnce(abortError(signal)),
          onerror: error => rejectOnce(signal.aborted ? abortError(signal) : new Error(error.error || `Could not download ${name}`)),
          onload: resolveOnce,
          onprogress: progress => {
            const total = progress.lengthComputable ? progress.total : null;
            onProgress(progress.loaded, total);
            if (total !== null && total > 0 && progress.loaded >= total) {
              resolveOnce();
            }
          },
          saveAs: false,
          url
        });
        if (signal.aborted) {
          abort();
        }
      });
    }
    function percentage(loaded, total) {
      if (!total || total <= 0) {
        return `${Math.round(loaded / 1_048_576)} MiB`;
      }
      return `${Math.min(100, Math.round(loaded / total * 100))}%`;
    }
    async function refreshedUrl(downloadUrl, signal) {
      const statUrl = downloadUrl.replace('/download/', '/statdownload/');
      if (statUrl === downloadUrl) {
        return null;
      }
      const response = await requestText(statUrl, {
        signal
      });
      const encoded = /"retry_url"\s*:\s*("(?:\\.|[^"\\])*")/.exec(response)?.[1];
      if (!encoded) {
        return null;
      }
      try {
        const parsed = JSON.parse(encoded);
        return typeof parsed === 'string' && parsed ? new URL(parsed, downloadUrl).href : null;
      } catch {
        return null;
      }
    }
    function hasExpectedSignature(response, kind) {
      const bytes = new Uint8Array(response.body, 0, Math.min(response.body.byteLength, 4));
      {
        return bytes[0] === 0x66 && bytes[1] === 0x4c && bytes[2] === 0x61 && bytes[3] === 0x43;
      }
    }
    async function requestExpectedBinary(url, kind, onProgress, signal) {
      const response = await requestBinaryChunked(url, onProgress, signal);
      if (!hasExpectedSignature(response)) {
        throw new Error(`Bandcamp returned ${response.contentType ?? 'an invalid payload'} instead of ${kind.toUpperCase()}`);
      }
      return response;
    }
    async function downloadBinaryWithRetry(url, kind, onProgress, signal) {
      const initialUrl = (await refreshedUrl(url, signal).catch(error => {
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
    async function downloadAlbum(release, download, report, signal) {
      const name = `${releaseBaseName(release)}.zip`;
      const onProgress = (loaded, total) => {
        report(`Downloading album ${percentage(loaded, total)}`, total ? loaded / total : undefined);
      };
      report('Checking Bandcamp download URL');
      const initialUrl = (await refreshedUrl(download.flacUrl, signal).catch(error => {
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
    async function downloadTrack(release, download, report, signal) {
      if (!release.artworkUrl) {
        throw new Error('Bandcamp did not provide artwork for this track');
      }
      report('Downloading FLAC');
      const flac = await downloadBinaryWithRetry(download.flacUrl, 'flac', (loaded, total) => {
        report(`Downloading FLAC ${percentage(loaded, total)}`, total ? loaded / total * 0.9 : undefined);
      }, signal);
      report('Downloading artwork', 0.9);
      const artwork = await requestBinaryChunked(release.artworkUrl, (loaded, total) => report('Downloading artwork', total ? 0.9 + loaded / total * 0.08 : undefined), signal);
      const baseName = releaseBaseName(release);
      const flacName = flac.fileName && flac.fileName.toLowerCase().endsWith('.flac') ? safeFileName(flac.fileName) : `${baseName}.flac`;
      const artworkExtension = extensionFromArtwork(artwork, release.artworkUrl);
      report('Packaging track ZIP', 0.98);
      const zip = createZip([{
        data: flac.body,
        name: flacName
      }, {
        data: artwork.body,
        name: `front.${artworkExtension}`
      }]);
      browserSave(zip, `${baseName}.zip`);
    }
    async function resolveDownload(release, inbox, report, signal) {
      const classification = classifyRelease(release);
      switch (classification) {
        case 'previous-download':
          {
            report('Resolving previous download');
            return fetchCookedDownload(release.paymentDownloadPage ?? '', signal);
          }
        case 'direct-free':
          {
            report('Resolving free download');
            return fetchCookedDownload(release.tralbum.freeDownloadPage ?? '', signal);
          }
        case 'email-gated':
          {
            report('Requesting download email');
            await inbox.requestDownloadEmail(release);
            report('Waiting for Bandcamp email');
            return inbox.waitForDownload(release);
          }
        case 'purchased':
          {
            report('Finding release in your collection');
            const cookedUrl = await resolvePurchasedDownload(release, signal);
            return fetchCookedDownload(cookedUrl, signal);
          }
        case 'unavailable':
          return null;
      }
    }
    async function downloadRelease(release, inbox, report, signal) {
      if (!release.tralbum.hasAudio) {
        return {
          detail: 'No downloadable audio',
          outcome: 'skipped'
        };
      }
      const download = await resolveDownload(release, inbox, report, signal);
      if (!download) {
        return {
          detail: 'Not free and not in your collection',
          outcome: 'skipped'
        };
      }
      if (release.tralbum.current.type === 'track') {
        await downloadTrack(release, download, report, signal);
      } else {
        await downloadAlbum(release, download, report, signal);
      }
      return {
        detail: 'Saved',
        outcome: 'completed'
      };
    }

    const HOST_ID = 'bcd-host';
    const ICON_PATHS = {
      check: ['m5 12 4 4L19 6'],
      collapse: ['m15 6-6 6 6 6'],
      download: ['M12 3v12m0 0 4-4m-4 4-4-4', 'M4 17v3h16v-3'],
      lock: ['M7 10V7a5 5 0 0 1 10 0v3', 'M5 10h14v10H5z'],
      retry: ['M20 11a8 8 0 1 0-2.34 5.66', 'M20 4v7h-7'],
      stop: ['M4 4h16v16H4z']
    };
    function icon(name) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.classList.add('bcd-icon');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('viewBox', '0 0 24 24');
      for (const data of ICON_PATHS[name]) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', data);
        svg.append(path);
      }
      return svg;
    }
    function buttonContent(button, label, iconName) {
      const children = [icon(iconName)];
      if (label) {
        children.push(document.createTextNode(label));
      }
      button.replaceChildren(...children);
    }
    class ProgressUi {
      action;
      bar;
      collapse;
      current;
      expandedWidth;
      host;
      initialLabel;
      notice;
      panel;
      showDetails;
      stop;
      summary;
      track;
      root;
      statusIcon = 'download';
      constructor(label, showDetails, onClick, onStop) {
        this.initialLabel = label;
        this.showDetails = showDetails;
        this.expandedWidth = showDetails ? 'min(390px, calc(100vw - 28px))' : 'min(300px, calc(100vw - 28px))';
        this.host = document.createElement('div');
        this.host.id = HOST_ID;
        this.host.style.setProperty('all', 'initial', 'important');
        this.host.style.setProperty('display', 'block', 'important');
        this.host.style.setProperty('position', 'fixed', 'important');
        this.host.style.setProperty('left', '14px', 'important');
        this.host.style.setProperty('bottom', '14px', 'important');
        this.host.style.setProperty('z-index', '2147483647', 'important');
        this.host.style.setProperty('width', this.expandedWidth, 'important');
        const shadow = this.host.attachShadow({
          mode: 'open'
        });
        const style = document.createElement('style');
        style.textContent = `
            :host {
                all: initial;
                box-sizing: border-box;
            }

            :where(.bcd-root, .bcd-root section, .bcd-root div, .bcd-root button) {
                all: unset;
                box-sizing: border-box;
            }

            .bcd-root {
                --bcd-surface: #121714;
                --bcd-surface-raised: #1a211d;
                --bcd-border: rgba(166, 244, 200, .3);
                --bcd-text: #edf5f0;
                --bcd-muted: #9eafa6;
                --bcd-accent: #a6f4c8;
                --bcd-accent-strong: #78dda5;
                --bcd-accent-ink: #092519;
                --bcd-danger: #ffb4ac;
                display: block;
                width: 100%;
                border: 1px solid var(--bcd-border);
                border-radius: 14px;
                background:
                    radial-gradient(circle at 15% 0%, rgba(128, 231, 173, .12), transparent 42%),
                    linear-gradient(145deg, #1a211d 0%, var(--bcd-surface) 72%);
                box-shadow:
                    0 18px 42px -18px rgba(0, 0, 0, .82),
                    0 0 0 1px rgba(166, 244, 200, .06),
                    0 0 26px rgba(98, 218, 151, .1);
                color: var(--bcd-text);
                font: 500 12px/1.4 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                padding: 8px;
            }

            .bcd-controls { display: flex; gap: 7px; }
            button {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 7px;
                min-height: 36px;
                border-radius: 9px;
                cursor: pointer;
                font: 750 12px/1 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                text-align: center;
                user-select: none;
                transition:
                    background 150ms ease,
                    border-color 150ms ease,
                    box-shadow 150ms ease,
                    transform 150ms ease;
            }
            .bcd-icon {
                display: block;
                flex: 0 0 auto;
                width: 15px;
                height: 15px;
            }
            .bcd-icon, .bcd-icon * {
                fill: none;
                stroke: currentColor;
                stroke-width: 2;
                stroke-linecap: round;
                stroke-linejoin: round;
            }
            button:focus-visible {
                outline: 2px solid var(--bcd-accent);
                outline-offset: 2px;
            }
            .bcd-action {
                flex: 1;
                border: 1px solid rgba(210, 255, 228, .62);
                background: linear-gradient(135deg, #c9fadd 0%, var(--bcd-accent-strong) 100%);
                box-shadow:
                    inset 0 1px 0 rgba(255, 255, 255, .65),
                    0 5px 16px rgba(74, 213, 135, .2),
                    0 0 18px rgba(111, 231, 163, .12);
                color: var(--bcd-accent-ink);
                padding: 0 13px;
            }
            .bcd-action:hover:not(:disabled) {
                background: linear-gradient(135deg, #dcffe9 0%, #91e7b7 100%);
                box-shadow:
                    inset 0 1px 0 rgba(255, 255, 255, .8),
                    0 7px 20px rgba(74, 213, 135, .28),
                    0 0 24px rgba(111, 231, 163, .18);
                transform: translateY(-1px);
            }
            .bcd-action:active:not(:disabled) { transform: translateY(0); }
            .bcd-action:disabled { cursor: default; opacity: .78; }
            .bcd-action.bcd-unavailable {
                border-color: rgba(248, 218, 156, .48);
                background: linear-gradient(135deg, #f2dcae 0%, #d8b66e 100%);
                box-shadow:
                    inset 0 1px 0 rgba(255, 255, 255, .5),
                    0 4px 16px rgba(215, 174, 93, .14);
                color: #332307;
                opacity: 1;
            }
            .bcd-stop {
                display: none;
                border: 1px solid rgba(255, 146, 136, .38);
                background: linear-gradient(145deg, #38201e, #251716);
                box-shadow: inset 0 1px 0 rgba(255, 255, 255, .05);
                color: var(--bcd-danger);
                padding: 0 11px;
            }
            .bcd-stop[data-visible="true"] { display: flex; }
            .bcd-stop:hover:not(:disabled) {
                border-color: rgba(255, 180, 172, .7);
                box-shadow: 0 0 16px rgba(255, 112, 100, .12);
            }
            .bcd-stop:disabled { cursor: default; opacity: .58; }
            .bcd-stop .bcd-icon * {
                fill: currentColor;
                stroke: none;
            }
            .bcd-collapse {
                flex: 0 0 36px;
                width: 36px;
                border: 1px solid rgba(166, 244, 200, .2);
                background: rgba(255, 255, 255, .035);
                color: #c7d7ce;
            }
            .bcd-collapse:hover {
                border-color: rgba(166, 244, 200, .48);
                background: rgba(166, 244, 200, .08);
                color: var(--bcd-accent);
                box-shadow: 0 0 16px rgba(111, 231, 163, .1);
            }
            .bcd-panel { display: none; padding: 8px 2px 1px; }
            .bcd-panel[data-visible="true"] { display: block; }
            .bcd-summary {
                display: block;
                margin-bottom: 6px;
                color: var(--bcd-text);
                font-weight: 680;
            }
            .bcd-track {
                display: block;
                overflow: hidden;
                height: 5px;
                border: 1px solid rgba(166, 244, 200, .12);
                border-radius: 999px;
                background: #27332d;
                box-shadow: inset 0 1px 3px rgba(0, 0, 0, .46);
            }
            .bcd-track[data-hidden="true"] { display: none; }
            .bcd-bar {
                display: block;
                width: 0;
                height: 100%;
                border-radius: inherit;
                background: linear-gradient(90deg, #65d897, #baf7d3);
                box-shadow: 0 0 10px rgba(111, 231, 163, .7);
                transition: width 200ms cubic-bezier(.25, 1, .5, 1);
            }
            .bcd-current {
                display: block;
                max-height: 3.2em;
                overflow: auto;
                margin-top: 6px;
                color: var(--bcd-muted);
                font-size: 11px;
                white-space: pre-line;
            }
            .bcd-root.bcd-detailed { padding: 10px; }
            .bcd-detailed .bcd-panel { padding-top: 10px; }
            .bcd-detailed .bcd-current {
                height: 8em;
                max-height: none;
                margin-top: 8px;
                padding-right: 4px;
                color: #c8d7cf;
                font-size: 11.5px;
                line-height: 1.5;
                scrollbar-color: rgba(166, 244, 200, .36) transparent;
                scrollbar-width: thin;
            }
            .bcd-notice {
                display: none;
                color: #c9d5ce;
                font-size: 11px;
            }
            .bcd-notice[data-visible="true"] { display: block; }

            .bcd-root[data-collapsed="true"] {
                width: 44px;
                height: 44px;
                overflow: hidden;
                border-radius: 50%;
                padding: 0;
                box-shadow:
                    0 10px 28px -10px rgba(0, 0, 0, .8),
                    0 0 0 1px rgba(166, 244, 200, .12),
                    0 0 22px rgba(98, 218, 151, .14);
            }
            .bcd-root[data-collapsed="true"] .bcd-action,
            .bcd-root[data-collapsed="true"] .bcd-stop,
            .bcd-root[data-collapsed="true"] .bcd-panel { display: none; }
            .bcd-root[data-collapsed="true"] .bcd-controls {
                display: block;
                width: 100%;
                height: 100%;
            }
            .bcd-root[data-collapsed="true"] .bcd-collapse {
                display: flex;
                width: 100%;
                height: 100%;
                min-height: 0;
                border: 0;
                border-radius: 50%;
                background: linear-gradient(135deg, #c9fadd 0%, var(--bcd-accent-strong) 100%);
                box-shadow: inset 0 1px 0 rgba(255, 255, 255, .7);
                color: var(--bcd-accent-ink);
            }
            .bcd-root[data-collapsed="true"] .bcd-collapse .bcd-icon {
                width: 18px;
                height: 18px;
            }
            .bcd-root[data-running="true"][data-collapsed="true"] .bcd-collapse {
                animation: bcd-pulse 1.8s ease-in-out infinite;
            }

            @keyframes bcd-pulse {
                50% { box-shadow: inset 0 1px 0 rgba(255, 255, 255, .7), 0 0 22px rgba(111, 231, 163, .55); }
            }

            @media (prefers-reduced-motion: reduce) {
                button, .bcd-bar { transition: none; }
            }
        `;
        this.root = document.createElement('section');
        this.root.className = showDetails ? 'bcd-root bcd-detailed' : 'bcd-root';
        this.root.dataset['collapsed'] = 'false';
        this.root.dataset['running'] = 'false';
        this.root.setAttribute('aria-label', 'Bandcamp download progress');
        const controls = document.createElement('div');
        controls.className = 'bcd-controls';
        this.action = document.createElement('button');
        this.action.className = 'bcd-action';
        this.action.type = 'button';
        buttonContent(this.action, label, 'download');
        this.action.addEventListener('click', onClick);
        this.stop = document.createElement('button');
        this.stop.className = 'bcd-stop';
        this.stop.type = 'button';
        buttonContent(this.stop, 'Stop', 'stop');
        this.stop.addEventListener('click', () => {
          this.stop.disabled = true;
          buttonContent(this.stop, 'Stopping…', 'stop');
          onStop();
        });
        this.collapse = document.createElement('button');
        this.collapse.className = 'bcd-collapse';
        this.collapse.type = 'button';
        this.collapse.title = 'Collapse downloader';
        this.collapse.setAttribute('aria-label', 'Collapse downloader');
        buttonContent(this.collapse, null, 'collapse');
        this.collapse.addEventListener('click', () => this.setCollapsed(this.root.dataset['collapsed'] !== 'true'));
        controls.append(this.collapse, this.action, this.stop);
        this.panel = document.createElement('div');
        this.panel.className = 'bcd-panel';
        this.summary = document.createElement('div');
        this.summary.className = 'bcd-summary';
        this.track = document.createElement('div');
        this.track.className = 'bcd-track';
        this.track.setAttribute('role', 'progressbar');
        this.track.setAttribute('aria-valuemin', '0');
        this.track.setAttribute('aria-valuemax', '100');
        this.bar = document.createElement('div');
        this.bar.className = 'bcd-bar';
        this.current = document.createElement('div');
        this.current.className = 'bcd-current';
        this.notice = document.createElement('div');
        this.notice.className = 'bcd-notice';
        this.track.append(this.bar);
        if (this.showDetails) {
          this.panel.append(this.summary, this.track, this.current, this.notice);
        } else {
          this.panel.append(this.track, this.notice);
        }
        this.root.append(controls, this.panel);
        shadow.append(style, this.root);
        document.body.append(this.host);
        this.setCollapsed(true);
      }
      setAction(label, iconName) {
        this.statusIcon = iconName;
        buttonContent(this.action, label, iconName);
        if (this.root.dataset['collapsed'] === 'true') {
          buttonContent(this.collapse, null, iconName);
        }
      }
      setCollapsed(collapsed) {
        this.root.dataset['collapsed'] = String(collapsed);
        this.host.style.setProperty('width', collapsed ? '44px' : this.expandedWidth, 'important');
        this.collapse.title = collapsed ? 'Expand downloader' : 'Collapse downloader';
        this.collapse.setAttribute('aria-label', collapsed ? 'Expand downloader' : 'Collapse downloader');
        buttonContent(this.collapse, null, collapsed ? this.statusIcon : 'collapse');
      }
      start(total) {
        this.action.disabled = true;
        this.setAction('Downloading…', 'download');
        this.root.dataset['running'] = 'true';
        this.stop.disabled = false;
        buttonContent(this.stop, 'Stop', 'stop');
        this.stop.dataset['visible'] = 'true';
        this.track.dataset['hidden'] = 'false';
        this.notice.dataset['visible'] = 'false';
        this.panel.dataset['visible'] = 'true';
        this.update({
          active: 0,
          completed: 0,
          current: ['Preparing downloads'],
          failed: 0,
          progress: 0,
          queued: total,
          skipped: 0,
          total
        });
      }
      update(snapshot) {
        const percent = Math.min(100, Math.max(0, snapshot.progress * 100));
        this.bar.style.width = `${percent}%`;
        this.track.setAttribute('aria-valuenow', String(Math.round(percent)));
        if (!this.showDetails) {
          return;
        }
        const processed = snapshot.completed + snapshot.skipped + snapshot.failed;
        this.summary.textContent = `${processed}/${snapshot.total} · ${snapshot.completed} saved · ` + `${snapshot.skipped} skipped · ${snapshot.failed} failed`;
        this.current.textContent = snapshot.current.join('\n') || 'Finishing…';
      }
      finish(snapshot) {
        this.update(snapshot);
        this.root.dataset['running'] = 'false';
        this.stop.dataset['visible'] = 'false';
        if (!this.showDetails) {
          this.panel.dataset['visible'] = 'false';
        }
        if (snapshot.failed > 0) {
          this.setAction(snapshot.failed === snapshot.total ? 'Failed · Try again' : 'Some failed · Try again', 'retry');
          this.action.disabled = false;
        } else if (snapshot.total > 0 && snapshot.completed === 0) {
          this.setAction('Nothing downloadable', 'lock');
          this.action.disabled = true;
        } else {
          this.setAction(this.initialLabel === 'Download All' ? 'Finished · Download all again' : 'Saved · Download again', 'check');
          this.action.disabled = false;
        }
        if (this.showDetails) {
          this.current.textContent = snapshot.total === 0 ? 'No album or track releases were found on this page.' : `${snapshot.completed} saved, ${snapshot.skipped} skipped, ${snapshot.failed} failed.`;
        }
      }
      cancel(snapshot) {
        this.update(snapshot);
        this.root.dataset['running'] = 'false';
        this.stop.dataset['visible'] = 'false';
        this.action.disabled = false;
        this.setAction('Stopped · Try again', 'retry');
        if (!this.showDetails) {
          this.panel.dataset['visible'] = 'false';
        }
        if (this.showDetails) {
          this.summary.textContent = 'Stopped';
          this.current.textContent = `${snapshot.completed} saved before stopping.`;
        }
      }
      unavailable(message) {
        this.root.dataset['running'] = 'false';
        this.action.classList.add('bcd-unavailable');
        this.action.disabled = true;
        this.setAction('Purchase required', 'lock');
        this.stop.dataset['visible'] = 'false';
        this.track.dataset['hidden'] = 'true';
        this.notice.textContent = message;
        this.notice.dataset['visible'] = 'true';
        this.panel.dataset['visible'] = 'true';
      }
    }
    function progressUiExists() {
      return document.getElementById(HOST_ID) !== null;
    }

    const MAX_ACTIVE_DOWNLOADS = 3;
    function errorMessage(error) {
      return error instanceof Error ? error.message : String(error);
    }
    async function runQueue(tasks, ui, currentRelease, signal) {
      const inbox = new GuerrillaInbox(signal);
      const itemProgress = new Map();
      const statuses = new Map();
      const snapshot = {
        active: 0,
        completed: 0,
        current: [],
        failed: 0,
        progress: 0,
        queued: tasks.length,
        skipped: 0,
        total: tasks.length
      };
      let nextIndex = 0;
      const render = () => {
        snapshot.current = [...statuses.values()];
        const processed = snapshot.completed + snapshot.skipped + snapshot.failed;
        const inProgress = [...itemProgress.values()].reduce((sum, progress) => sum + progress, 0);
        snapshot.progress = snapshot.total === 0 ? 1 : (processed + inProgress) / snapshot.total;
        ui.update(snapshot);
      };
      const worker = async () => {
        while (!signal.aborted && nextIndex < tasks.length) {
          const index = nextIndex;
          nextIndex += 1;
          const task = tasks[index];
          if (!task) {
            continue;
          }
          snapshot.queued -= 1;
          snapshot.active += 1;
          itemProgress.set(index, 0);
          statuses.set(index, `${task.title}: loading release page`);
          render();
          try {
            const release = currentRelease && tasks.length === 1 && task.url === currentRelease.url ? currentRelease : await fetchRelease(task.url, signal);
            const report = (message, progress) => {
              statuses.set(index, `${release.title}: ${message}`);
              if (progress !== undefined) {
                itemProgress.set(index, Math.min(0.99, Math.max(0, progress)));
              }
              render();
            };
            const result = await downloadRelease(release, inbox, report, signal);
            if (result.outcome === 'completed') {
              snapshot.completed += 1;
            } else {
              snapshot.skipped += 1;
            }
            statuses.set(index, `${release.title}: ${result.detail}`);
          } catch (error) {
            if (signal.aborted) {
              statuses.set(index, `${task.title}: stopped`);
            } else {
              snapshot.failed += 1;
              statuses.set(index, `${task.title}: ${errorMessage(error)}`);
              console.error('[Bandcamp Collection Downloader]', task.url, error);
            }
          } finally {
            snapshot.active -= 1;
            itemProgress.delete(index);
            render();
            window.setTimeout(() => {
              statuses.delete(index);
              if (snapshot.active > 0 || snapshot.queued > 0) {
                render();
              }
            }, 2_500);
          }
        }
      };
      await Promise.all(Array.from({
        length: Math.min(MAX_ACTIVE_DOWNLOADS, tasks.length)
      }, () => worker()));
      statuses.clear();
      snapshot.current = [];
      if (signal.aborted) {
        snapshot.queued = 0;
        ui.cancel(snapshot);
      } else {
        snapshot.progress = 1;
        ui.finish(snapshot);
      }
    }
    function main() {
      if (progressUiExists()) {
        return;
      }
      const pageKind = detectPage();
      if (pageKind === 'unsupported') {
        return;
      }
      let tasks;
      let currentRelease = null;
      if (pageKind === 'discography') {
        tasks = discoverReleases(document, window.location.href);
      } else {
        try {
          currentRelease = parseReleaseDocument(document, window.location.href);
          tasks = [{
            title: currentRelease.title,
            url: window.location.href
          }];
        } catch (error) {
          console.error('[Bandcamp Collection Downloader] Could not initialize page', error);
          return;
        }
      }
      let controller = null;
      const unavailable = currentRelease !== null && classifyRelease(currentRelease) === 'unavailable';
      let ui;
      ui = new ProgressUi(pageKind === 'discography' ? 'Download All' : 'Download', pageKind === 'discography', () => {
        controller = new AbortController();
        ui.start(tasks.length);
        void runQueue(tasks, ui, currentRelease, controller.signal);
      }, () => controller?.abort());
      if (unavailable) {
        ui.unavailable("This paid release isn't available in your Bandcamp collection.");
      }
    }
    main();

})();
