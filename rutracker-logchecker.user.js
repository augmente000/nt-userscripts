// ==UserScript==
// @name         RuTracker New-Team Logchecker
// @description  Checks supported CD rip logs on RuTracker topic pages with the New-Team logchecker.
// @version      2026.07.27.7
// @author       
// @namespace    https://update.greasyfork.org/scripts/539543
// @downloadURL  https://update.greasyfork.org/scripts/539543/RTO%20EAC%20Validator.user.js
// @updateURL    https://update.greasyfork.org/scripts/539543/RTO%20EAC%20Validator.meta.js
// @match        https://rutracker.org/forum/viewtopic.php*
// @connect      new-team.org
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const STYLE_ID = 'nt-logchecker-styles';
    const CSS = `
.nt-logchecker pre {
    margin: 10px 0;
    padding: 12px;
    overflow: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-family: Consolas, Monaco, "Courier New", monospace;
    line-height: 1.4;
}

.nt-logchecker .good {
    color: #198754;
}

.nt-logchecker .goodish {
    color: #0891b2;
}

.nt-logchecker .badish {
    color: #b7791f;
}

.nt-logchecker .bad {
    color: #dc3545;
}

.nt-logchecker .log1,
.nt-logchecker .log5 {
    text-decoration: underline;
}

.nt-logchecker .log3 {
    color: #2563eb;
}

.nt-logchecker .log4 {
    font-weight: bold;
}

.nt-logchecker-spoiler {
    border-left: 4px solid #2563eb;
}

.nt-logchecker-spoiler > .sp-head {
    background: rgba(37, 99, 235, 0.06);
}

.nt-logchecker-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    align-items: flex-end;
    margin: 10px 0 0;
    border-bottom: 1px solid #b8c4d0;
}

.nt-logchecker-tabs {
    display: flex;
    gap: 4px;
}

.nt-logchecker-tab {
    appearance: none;
    padding: 6px 12px;
    border: 1px solid #b8c4d0;
    border-bottom: 0;
    border-radius: 4px 4px 0 0;
    background: #edf1f5;
    color: inherit;
    cursor: pointer;
    font: inherit;
}

.nt-logchecker-tab:hover,
.nt-logchecker-tab:focus-visible {
    background: #e2e8f0;
}

.nt-logchecker-tab.is-active {
    background: #fff;
    font-weight: bold;
}

a.nt-logchecker-external-link,
a.nt-logchecker-external-link:link,
a.nt-logchecker-external-link:visited {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    margin: 0 0 6px auto;
    padding: 5px 10px;
    color: #fff !important;
    font-weight: bold;
    line-height: 1.2;
    text-decoration: none !important;
    white-space: nowrap;
    background: #1e40af;
    border: 1px solid #1e3a8a;
    border-radius: 4px;
    box-shadow: 0 1px 2px rgb(0 0 0 / 18%);
}

a.nt-logchecker-external-link:hover,
a.nt-logchecker-external-link:focus-visible {
    color: #fff !important;
    text-decoration: none !important;
    background: #1e3a8a;
}

a.nt-logchecker-external-link:focus-visible {
    outline: 2px solid #2563eb;
    outline-offset: 2px;
}

.nt-logchecker-external-icon {
    width: 16px;
    height: 16px;
    border-radius: 2px;
}

.nt-logchecker-panel[hidden] {
    display: none;
}
`;
    function addStyles() {
      if (document.getElementById(STYLE_ID)) {
        return;
      }
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      (document.head ?? document.documentElement).append(style);
    }

    const API_URL = 'https://new-team.org/api/logchecker';
    const MAX_LOG_SIZE = 2 * 1024 * 1024;
    const REQUEST_TIMEOUT = 60_000;
    const STATE_ATTRIBUTE = 'data-nt-logchecker-state';
    const POST_SOURCE_URL = 'https://rutracker.org/forum/ajax.php';
    let viewerId = 0;
    const postSourceRequests = new Map();
    const RIPPER_PATTERNS = [{
      name: 'eac',
      pattern: /Exact Audio Copy|EAC extraction|Отч[её]т EAC/iu
    }, {
      name: 'xld',
      pattern: /\bXLD\b|X Lossless Decoder/iu
    }, {
      name: 'dbpoweramp',
      pattern: /\bdBpoweramp\b/iu
    }, {
      name: 'whippy',
      pattern: /\bwhipp(?:y|er)\b/iu
    }];
    function detectRipper(log) {
      return RIPPER_PATTERNS.find(({
        pattern
      }) => pattern.test(log))?.name ?? null;
    }
    function getPostId(post) {
      const codeControl = post.querySelector('.t-post-buttons [onclick*="ajax.view_post"]');
      const handler = codeControl?.getAttribute('onclick') ?? '';
      const handlerMatch = /ajax\.view_post\(\s*['"](\d+)['"]\s*\)/u.exec(handler);
      if (handlerMatch?.[1]) {
        return handlerMatch[1];
      }
      const idMatch = /^post_(\d+)$/u.exec(post.id);
      return idMatch?.[1] ?? null;
    }
    function getFormToken() {
      const pageToken = unsafeWindow.BB?.form_token;
      if (typeof pageToken === 'string' && pageToken) {
        return pageToken;
      }
      const inputToken = document.querySelector('input[name="form_token"]')?.value;
      return inputToken || null;
    }
    async function fetchPostSource(postId) {
      const formToken = getFormToken();
      if (!formToken) {
        throw new Error('RuTracker form token was not found.');
      }
      console.info(`[New-Team logchecker] Loading BBCode for RuTracker post ${postId}.`);
      const response = await fetch(POST_SOURCE_URL, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
        },
        body: new URLSearchParams({
          action: 'view_post',
          post_id: postId,
          mode: 'text',
          form_token: formToken
        })
      });
      if (!response.ok) {
        throw new Error(`RuTracker returned HTTP ${response.status} while loading BBCode.`);
      }
      const data = await response.json();
      if (typeof data.post_text !== 'string') {
        throw new Error('RuTracker returned an invalid BBCode response.');
      }
      return data.post_text;
    }
    function getPostSource(postId) {
      const cachedRequest = postSourceRequests.get(postId);
      if (cachedRequest) {
        return cachedRequest;
      }
      const request = fetchPostSource(postId);
      postSourceRequests.set(postId, request);
      return request;
    }
    function extractPreBlocks(bbCode) {
      return Array.from(bbCode.matchAll(/\[pre\]([\s\S]*?)\[\/pre\]/giu), match => match[1] ?? '');
    }
    function requestLogcheck(log) {
      console.info(`[New-Team logchecker] Sending ${new TextEncoder().encode(log).byteLength} bytes to ${API_URL}.`);
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'POST',
          url: API_URL,
          headers: {
            'Content-Type': 'text/plain'
          },
          data: log,
          responseType: 'text',
          timeout: REQUEST_TIMEOUT,
          onload: response => {
            console.info(`[New-Team logchecker] Received HTTP ${response.status} from ${API_URL}.`);
            if (response.status < 200 || response.status >= 300) {
              reject(new Error(`Logchecker returned HTTP ${response.status}.`));
              return;
            }
            if (typeof response.responseText !== 'string') {
              reject(new Error('Logchecker returned an invalid response body.'));
              return;
            }
            resolve({
              html: response.responseText,
              headers: response.responseHeaders
            });
          },
          onabort: () => {
            reject(new Error('Logchecker request was aborted.'));
          },
          onerror: response => {
            reject(new Error(`Logchecker request failed (HTTP ${response.status || 'unknown'}).`));
          },
          ontimeout: () => {
            reject(new Error('Logchecker request timed out.'));
          }
        });
      });
    }
    function parseResponseHeaders(rawHeaders) {
      const headers = new Map();
      for (const line of rawHeaders.split(/\r?\n/u)) {
        const separator = line.indexOf(':');
        if (separator < 1) {
          continue;
        }
        headers.set(line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim());
      }
      return headers;
    }
    function createViewer(response, original) {
      viewerId += 1;
      const idPrefix = `nt-logchecker-${viewerId}`;
      const viewer = document.createElement('div');
      viewer.className = 'nt-logchecker-viewer';
      viewer.setAttribute(STATE_ATTRIBUTE, 'complete');
      const toolbar = document.createElement('div');
      toolbar.className = 'nt-logchecker-toolbar';
      const tabs = document.createElement('div');
      tabs.className = 'nt-logchecker-tabs';
      tabs.setAttribute('role', 'tablist');
      const checkedTab = document.createElement('button');
      checkedTab.type = 'button';
      checkedTab.className = 'nt-logchecker-tab is-active';
      checkedTab.id = `${idPrefix}-checked-tab`;
      checkedTab.textContent = 'Logchecker';
      checkedTab.setAttribute('role', 'tab');
      checkedTab.setAttribute('aria-selected', 'true');
      checkedTab.setAttribute('aria-controls', `${idPrefix}-checked-panel`);
      const originalTab = document.createElement('button');
      originalTab.type = 'button';
      originalTab.className = 'nt-logchecker-tab';
      originalTab.id = `${idPrefix}-original-tab`;
      originalTab.textContent = 'Original';
      originalTab.setAttribute('role', 'tab');
      originalTab.setAttribute('aria-selected', 'false');
      originalTab.setAttribute('aria-controls', `${idPrefix}-original-panel`);
      const fullCheckerLink = document.createElement('a');
      fullCheckerLink.className = 'nt-logchecker-external-link';
      fullCheckerLink.href = 'https://new-team.org/tools/logchecker';
      fullCheckerLink.target = '_blank';
      fullCheckerLink.rel = 'noopener noreferrer';
      fullCheckerLink.title = 'Open the full logchecker with file upload support';
      const fullCheckerIcon = document.createElement('img');
      fullCheckerIcon.className = 'nt-logchecker-external-icon';
      fullCheckerIcon.src = 'https://new-team.org/favicon.ico';
      fullCheckerIcon.alt = '';
      const fullCheckerLabel = document.createElement('span');
      fullCheckerLabel.textContent = 'NT Log Checker';
      fullCheckerLink.append(fullCheckerIcon, fullCheckerLabel);
      const checkedPanel = document.createElement('div');
      checkedPanel.className = 'nt-logchecker nt-logchecker-panel';
      checkedPanel.id = `${idPrefix}-checked-panel`;
      checkedPanel.setAttribute('role', 'tabpanel');
      checkedPanel.setAttribute('aria-labelledby', checkedTab.id);
      checkedPanel.innerHTML = response.html;
      const originalPanel = document.createElement('div');
      originalPanel.className = 'nt-logchecker-panel';
      originalPanel.id = `${idPrefix}-original-panel`;
      originalPanel.hidden = true;
      originalPanel.setAttribute('role', 'tabpanel');
      originalPanel.setAttribute('aria-labelledby', originalTab.id);
      const selectTab = showOriginal => {
        checkedTab.classList.toggle('is-active', !showOriginal);
        checkedTab.setAttribute('aria-selected', String(!showOriginal));
        checkedPanel.hidden = showOriginal;
        originalTab.classList.toggle('is-active', showOriginal);
        originalTab.setAttribute('aria-selected', String(showOriginal));
        originalPanel.hidden = !showOriginal;
      };
      checkedTab.addEventListener('click', () => {
        selectTab(false);
      });
      originalTab.addEventListener('click', () => {
        selectTab(true);
      });
      tabs.append(originalTab, checkedTab);
      toolbar.append(tabs, fullCheckerLink);
      viewer.append(toolbar, checkedPanel, originalPanel);
      const headers = parseResponseHeaders(response.headers);
      const metadataHeaders = {
        ripper: 'x-logchecker-ripper',
        version: 'x-logchecker-version',
        score: 'x-logchecker-score',
        checksum: 'x-logchecker-checksum'
      };
      for (const [dataName, headerName] of Object.entries(metadataHeaders)) {
        const value = headers.get(headerName);
        if (value) {
          checkedPanel.dataset[dataName] = value;
        }
      }
      original.replaceWith(viewer);
      originalPanel.append(original);
      return viewer;
    }
    function setState(pre, state) {
      pre.setAttribute(STATE_ATTRIBUTE, state);
    }
    async function checkLog(pre, spoiler, ripper, log) {
      spoiler.classList.add('nt-logchecker-spoiler', `nt-logchecker-spoiler--${ripper}`);
      if (new TextEncoder().encode(log).byteLength > MAX_LOG_SIZE) {
        setState(pre, 'failed');
        console.warn('[New-Team logchecker] Log exceeds the 2 MiB limit; leaving it unchanged.');
        return;
      }
      try {
        const response = await requestLogcheck(log);
        setState(pre, 'complete');
        createViewer(response, pre);
      } catch (error) {
        setState(pre, 'failed');
        console.error('[New-Team logchecker] Could not check the log; leaving it unchanged.', error);
      }
    }
    async function processSpoiler(spoiler) {
      const body = Array.from(spoiler.children).find(child => child.classList.contains('sp-body'));
      if (!(body instanceof HTMLElement)) {
        return;
      }
      const post = spoiler.closest('tbody[id^="post_"]');
      const postId = post ? getPostId(post) : null;
      if (!post || !postId) {
        console.error('[New-Team logchecker] Could not determine the RuTracker post ID.');
        return;
      }
      const candidates = Array.from(body.querySelectorAll('pre.post-pre')).filter(candidate => candidate.closest('.sp-wrap') === spoiler && !candidate.closest('.nt-logchecker') && !candidate.hasAttribute(STATE_ATTRIBUTE));
      if (candidates.length === 0) {
        return;
      }
      for (const candidate of candidates) {
        setState(candidate, 'checking');
      }
      let preBlocks;
      try {
        preBlocks = extractPreBlocks(await getPostSource(postId));
      } catch (error) {
        for (const candidate of candidates) {
          setState(candidate, 'failed');
        }
        console.error('[New-Team logchecker] Could not load the post BBCode; leaving logs unchanged.', error);
        return;
      }
      const renderedPreBlocks = Array.from(post.querySelectorAll('pre.post-pre'));
      for (const candidate of candidates) {
        const blockIndex = renderedPreBlocks.indexOf(candidate);
        const log = blockIndex >= 0 ? preBlocks[blockIndex] : undefined;
        if (log === undefined) {
          setState(candidate, 'failed');
          console.error('[New-Team logchecker] Could not match the rendered log to its BBCode source.');
          continue;
        }
        const ripper = detectRipper(log);
        if (ripper) {
          console.info(`[New-Team logchecker] Detected ${ripper} log in RuTracker post ${postId}.`);
          void checkLog(candidate, spoiler, ripper, log);
        } else {
          setState(candidate, 'ignored');
        }
      }
    }
    function isExpanded(spoiler) {
      const body = Array.from(spoiler.children).find(child => child.classList.contains('sp-body'));
      if (!(body instanceof HTMLElement)) {
        return false;
      }
      return spoiler.classList.contains('sp-opened') || getComputedStyle(body).display !== 'none';
    }
    function highlightSpoilerFromHtml(spoiler) {
      const sourceBlocks = Array.from(spoiler.querySelectorAll('pre.post-pre')).filter(source => source.closest('.sp-wrap') === spoiler);
      for (const source of sourceBlocks) {
        const ripper = detectRipper(source.textContent ?? '');
        if (ripper) {
          spoiler.classList.add('nt-logchecker-spoiler', `nt-logchecker-spoiler--${ripper}`);
        }
      }
    }
    function handleSpoilerClick(event) {
      if (!(event.target instanceof Element)) {
        return;
      }
      const head = event.target.closest('.sp-head');
      const spoiler = head?.closest('.sp-wrap');
      if (!(spoiler instanceof HTMLElement)) {
        return;
      }
      const wasExpanded = isExpanded(spoiler);
      window.setTimeout(() => {
        if (!wasExpanded && isExpanded(spoiler)) {
          void processSpoiler(spoiler);
        }
      }, 0);
    }
    function init() {
      addStyles();
      document.querySelectorAll('.sp-wrap').forEach(highlightSpoilerFromHtml);
      document.addEventListener('click', handleSpoilerClick, true);
    }
    init();

})();
