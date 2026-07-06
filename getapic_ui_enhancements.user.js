// ==UserScript==
// @name         Getapic UI Enhancements
// @description  Add UI enhancements to getapic.me session list pages
// @version      2026.07.06.1
// @author       987982598734
// @namespace    https://update.greasyfork.org/scripts/585345
// @downloadURL  https://update.greasyfork.org/scripts/585345/getapic_ui_enhancements.user.js
// @updateURL    https://update.greasyfork.org/scripts/585345/getapic_ui_enhancements.user.js
// @match        https://getapic.me/v
// @match        https://getapic.me/v/*
// @match        https://getapic.me/v?*
// @grant        GM_openInTab
// @grant        unsafeWindow
// @run-at       document-end
// @icon         https://www.google.com/s2/favicons?sz=64&domain=getapic.me
// ==/UserScript==

(function () {
    'use strict';

    const SESSION_ROW_ID_PATTERN = /^set-(\d+)$/;
    const ALL_PREVIEWS_LABEL = 'Все HTML превью';
    const SINGLE_IMAGE_HTML_LABEL = 'HTML картинка в тексте:';
    function extractSessionsFromTable(table) {
      const sessions = [];
      for (const row of table.querySelectorAll('tbody tr[id^="set-"]')) {
        const match = SESSION_ROW_ID_PATTERN.exec(row.id);
        if (!match) {
          continue;
        }
        const link = row.querySelector('td a[href^="/rs/"]');
        if (!link) {
          continue;
        }
        sessions.push({
          sessionId: match[1],
          url: new URL(link.getAttribute('href') ?? '', location.origin).href,
          row
        });
      }
      return sessions;
    }
    function findAllPreviewsTextarea(doc) {
      for (const li of doc.querySelectorAll('li')) {
        const label = li.querySelector('span');
        if (!label?.textContent?.includes(ALL_PREVIEWS_LABEL)) {
          continue;
        }
        const textarea = li.querySelector('textarea.form-control');
        if (textarea) {
          return textarea;
        }
      }
      return null;
    }
    function findSingleImageHtmlInputs(doc) {
      const values = [];
      for (const li of doc.querySelectorAll('li')) {
        const label = li.querySelector('span');
        if (!label?.textContent?.includes(SINGLE_IMAGE_HTML_LABEL)) {
          continue;
        }
        const input = li.querySelector('input.form-control');
        const value = input?.value.trim();
        if (value) {
          values.push(value);
        }
      }
      return values;
    }
    function findAnonStoreImageSrcs(doc) {
      const srcs = [];
      for (const img of doc.querySelectorAll('img[src^="/get/store/"]')) {
        const src = img.getAttribute('src')?.trim();
        if (src) {
          srcs.push(src);
        }
      }
      return srcs;
    }
    function buildPreviewHtmlFromImageSrcs(srcs) {
      return srcs.map(src => `<img src="${src}" border="0">`).join(' ');
    }
    function extractPreviewHtmlFromPage(html) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const textarea = findAllPreviewsTextarea(doc);
      if (textarea) {
        const content = textarea.value.trim() || textarea.textContent?.trim() || '';
        if (content) {
          return content;
        }
      }
      const singleImageHtmlValues = findSingleImageHtmlInputs(doc);
      if (singleImageHtmlValues.length > 0) {
        return singleImageHtmlValues.join(' ');
      }
      const anonStoreImageSrcs = findAnonStoreImageSrcs(doc);
      if (anonStoreImageSrcs.length > 0) {
        return buildPreviewHtmlFromImageSrcs(anonStoreImageSrcs);
      }
      return '';
    }

    const STORAGE_PREFIX = 'nt-getapic-previews:';
    /** ~6 weeks — middle of the requested 1–2 month range */
    const CACHE_TTL_MS = 45 * 24 * 60 * 60 * 1000;
    function storageKey(sessionId) {
      return `${STORAGE_PREFIX}${sessionId}`;
    }
    function getStorage() {
      return unsafeWindow.localStorage;
    }
    function getCachedPreviews(sessionId) {
      const raw = getStorage().getItem(storageKey(sessionId));
      if (!raw) {
        return null;
      }
      try {
        const cached = JSON.parse(raw);
        if (typeof cached.html !== 'string' || typeof cached.fetchedAt !== 'number') {
          return null;
        }
        if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) {
          getStorage().removeItem(storageKey(sessionId));
          return null;
        }
        return cached.html;
      } catch {
        getStorage().removeItem(storageKey(sessionId));
        return null;
      }
    }
    function setCachedPreviews(sessionId, html) {
      const entry = {
        html,
        fetchedAt: Date.now()
      };
      getStorage().setItem(storageKey(sessionId), JSON.stringify(entry));
    }
    function clearCachedPreviews(sessionId) {
      getStorage().removeItem(storageKey(sessionId));
    }

    async function fetchSessionPreviews(sessionUrl) {
      const response = await fetch(sessionUrl, {
        method: 'GET',
        credentials: 'same-origin'
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch session: ${response.status}`);
      }
      const html = await response.text();
      return extractPreviewHtmlFromPage(html);
    }
    function sleep(ms) {
      return new Promise(resolve => {
        setTimeout(resolve, ms);
      });
    }

    const PREVIEW_CELL_CLASS = 'nt-getapic-preview-cell';
    const PREVIEW_CONTAINER_CLASS = 'nt-getapic-previews';
    const MARKER_ATTR = 'data-nt-getapic-previews';
    const OPEN_ALL_MARKER_ATTR = 'data-nt-getapic-open-all';
    const REFRESH_ALL_MARKER_ATTR = 'data-nt-getapic-refresh-all';
    const CLAIM_ALL_MARKER_ATTR = 'data-nt-getapic-claim-all';
    const ANON_ACTIONS_MARKER_ATTR = 'data-nt-getapic-anon-actions';
    const JUMBOTRON_SELECTOR = '.jumbotron.medium-height.align-left';
    const ANON_BUTTON_SELECTOR = 'a.btn.btn-xs.btn-primary';
    const OPEN_ALL_BUTTON_LABEL = 'Открыть все сессии';
    const REFRESH_ALL_BUTTON_LABEL = '↻ Обновить превью';
    const CLAIM_ALL_BUTTON_LABEL = 'Забрать все сессии себе';
    function isAnonymousSessionsPage() {
      return new URLSearchParams(location.search).get('anon') === '1';
    }
    function ensurePreviewColumn(table) {
      if (table.querySelector(`.${PREVIEW_CELL_CLASS}`)) {
        return;
      }
      const headerRow = table.querySelector('thead tr');
      if (headerRow) {
        const header = document.createElement('th');
        header.textContent = 'Превью';
        headerRow.insertBefore(header, headerRow.firstChild);
      }
    }
    function getOrCreatePreviewCell(row) {
      let cell = row.querySelector(`.${PREVIEW_CELL_CLASS}`);
      if (cell) {
        return cell;
      }
      cell = document.createElement('td');
      cell.className = PREVIEW_CELL_CLASS;
      row.insertBefore(cell, row.firstChild);
      return cell;
    }
    function stylePreviewImages(container) {
      for (const img of container.querySelectorAll('img')) {
        img.loading = 'lazy';
        Object.assign(img.style, {
          maxHeight: '80px',
          maxWidth: '120px',
          margin: '2px',
          objectFit: 'contain',
          verticalAlign: 'middle'
        });
      }
    }
    function renderLoadingState(row) {
      const cell = getOrCreatePreviewCell(row);
      cell.textContent = '…';
      cell.style.color = '#888';
      cell.style.fontSize = '12px';
    }
    function renderErrorState(row) {
      const cell = getOrCreatePreviewCell(row);
      cell.replaceChildren();
      const label = document.createElement('span');
      label.textContent = 'ошибка';
      label.style.color = '#c00';
      label.style.fontSize = '12px';
      cell.append(label);
    }
    function renderPreviews(row, previewHtml) {
      const cell = getOrCreatePreviewCell(row);
      cell.replaceChildren();
      cell.style.color = '';
      const container = document.createElement('span');
      container.className = PREVIEW_CONTAINER_CLASS;
      Object.assign(container.style, {
        display: 'inline-flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '2px',
        maxWidth: '420px'
      });
      if (!previewHtml) {
        const empty = document.createElement('span');
        empty.textContent = '—';
        empty.style.color = '#888';
        empty.style.fontSize = '12px';
        container.append(empty);
      } else {
        container.insertAdjacentHTML('beforeend', previewHtml);
        stylePreviewImages(container);
      }
      cell.appendChild(container);
    }
    function isRowProcessed(row) {
      return row.hasAttribute(MARKER_ATTR);
    }
    function markRowProcessed(row) {
      row.setAttribute(MARKER_ATTR, '1');
    }
    function openSessionInBackgroundTab(url) {
      GM_openInTab(url, {
        active: false
      });
    }
    function ensureOpenAllSessionsButton(sessions) {
      const jumbotron = document.querySelector(JUMBOTRON_SELECTOR);
      if (!jumbotron || jumbotron.querySelector(`[${OPEN_ALL_MARKER_ATTR}]`)) {
        return;
      }
      const flexColumn = jumbotron.querySelector('.flex.flex-column');
      if (!flexColumn) {
        return;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-xs btn-primary';
      button.textContent = OPEN_ALL_BUTTON_LABEL;
      button.setAttribute(OPEN_ALL_MARKER_ATTR, '1');
      button.title = `Открыть ${sessions.length} сессий в фоновых вкладках`;
      button.disabled = sessions.length === 0;
      button.style.marginLeft = '6px';
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        for (const session of sessions) {
          openSessionInBackgroundTab(session.url);
        }
      });
      const anonButton = jumbotron.querySelector(ANON_BUTTON_SELECTOR);
      if (anonButton) {
        anonButton.insertAdjacentElement('afterend', button);
      } else {
        flexColumn.insertAdjacentElement('beforebegin', button);
      }
    }
    function ensureRefreshAllPreviewsButton(onRefresh) {
      const jumbotron = document.querySelector(JUMBOTRON_SELECTOR);
      if (!jumbotron || jumbotron.querySelector(`[${REFRESH_ALL_MARKER_ATTR}]`)) {
        return;
      }
      const openAllButton = jumbotron.querySelector(`[${OPEN_ALL_MARKER_ATTR}]`);
      if (!openAllButton) {
        return;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-xs btn-primary';
      button.textContent = REFRESH_ALL_BUTTON_LABEL;
      button.setAttribute(REFRESH_ALL_MARKER_ATTR, '1');
      button.title = 'Обновить превью всех сессий на странице';
      button.style.marginLeft = '6px';
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        onRefresh();
      });
      openAllButton.insertAdjacentElement('afterend', button);
    }
    function buildSessionActionUrl(sessionUrl, action) {
      const url = new URL(sessionUrl);
      return `${url.pathname}?${action}=1`;
    }
    async function claimSession(sessionUrl) {
      const response = await fetch(buildSessionActionUrl(sessionUrl, 'join'));
      if (!response.ok) {
        throw new Error(`Failed to claim session: ${response.status}`);
      }
    }
    function ensureClaimAllSessionsButton(sessions) {
      if (!isAnonymousSessionsPage()) {
        return;
      }
      const jumbotron = document.querySelector(JUMBOTRON_SELECTOR);
      if (!jumbotron || jumbotron.querySelector(`[${CLAIM_ALL_MARKER_ATTR}]`)) {
        return;
      }
      const anchorButton = jumbotron.querySelector(`[${REFRESH_ALL_MARKER_ATTR}]`) ?? jumbotron.querySelector(`[${OPEN_ALL_MARKER_ATTR}]`);
      if (!anchorButton) {
        return;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-xs btn-danger';
      button.textContent = CLAIM_ALL_BUTTON_LABEL;
      button.setAttribute(CLAIM_ALL_MARKER_ATTR, '1');
      button.title = `Забрать ${sessions.length} сессий себе`;
      button.disabled = sessions.length === 0;
      button.style.marginLeft = '6px';
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        if (!confirm(`Забрать все ${sessions.length} сессий себе?`)) {
          return;
        }
        void (async () => {
          button.disabled = true;
          try {
            for (const session of sessions) {
              await claimSession(session.url);
            }
            location.reload();
          } catch {
            alert('Не удалось забрать одну или несколько сессий.');
            button.disabled = false;
          }
        })();
      });
      anchorButton.insertAdjacentElement('afterend', button);
    }
    function ensureAnonymousSessionActions(sessions) {
      if (!isAnonymousSessionsPage()) {
        return;
      }
      for (const session of sessions) {
        const link = session.row.querySelector('td a[href^="/rs/"]');
        if (!link || link.parentElement?.querySelector(`[${ANON_ACTIONS_MARKER_ATTR}]`)) {
          continue;
        }
        const actions = document.createElement('div');
        actions.setAttribute(ANON_ACTIONS_MARKER_ATTR, '1');
        actions.style.marginTop = '4px';
        const joinLink = document.createElement('a');
        joinLink.href = buildSessionActionUrl(session.url, 'join');
        joinLink.className = 'btn btn-xs btn-danger';
        joinLink.textContent = 'Забрать сессиию себе';
        const deleteLink = document.createElement('a');
        deleteLink.href = buildSessionActionUrl(session.url, 'delete');
        deleteLink.className = 'btn btn-xs btn-danger';
        deleteLink.textContent = '⚠️Удалить !!!';
        deleteLink.style.marginLeft = '4px';
        actions.append(joinLink, deleteLink);
        link.insertAdjacentElement('afterend', actions);
      }
    }

    const FETCH_INTERVAL_MS = 1000;
    class PreviewFetchQueue {
      pending = [];
      processing = false;
      enqueue(session) {
        this.pending.push(session);
        void this.process();
      }
      refresh(session) {
        clearCachedPreviews(session.sessionId);
        renderLoadingState(session.row);
        this.enqueue(session);
      }
      refreshAll(sessions) {
        for (const session of sessions) {
          this.refresh(session);
        }
      }
      async process() {
        if (this.processing) {
          return;
        }
        this.processing = true;
        while (this.pending.length > 0) {
          const session = this.pending.shift();
          void this.fetchAndRender(session);
          if (this.pending.length > 0) {
            await sleep(FETCH_INTERVAL_MS);
          }
        }
        this.processing = false;
      }
      async fetchAndRender(session) {
        try {
          const previewHtml = await fetchSessionPreviews(session.url);
          setCachedPreviews(session.sessionId, previewHtml);
          renderPreviews(session.row, previewHtml);
        } catch {
          renderErrorState(session.row);
        }
      }
    }
    function loadCachedOrQueue(session, queue) {
      const cached = getCachedPreviews(session.sessionId);
      if (cached !== null) {
        renderPreviews(session.row, cached);
        return;
      }
      renderLoadingState(session.row);
      queue.enqueue(session);
    }

    const TABLE_SELECTOR = 'table.table.table-striped.table-bordered.table-hover.table-condensed';
    function init() {
      const table = document.querySelector(TABLE_SELECTOR);
      if (!table) {
        return;
      }
      ensurePreviewColumn(table);
      const sessions = extractSessionsFromTable(table);
      ensureOpenAllSessionsButton(sessions);
      ensureAnonymousSessionActions(sessions);
      const queue = new PreviewFetchQueue();
      ensureRefreshAllPreviewsButton(() => {
        queue.refreshAll(sessions);
      });
      ensureClaimAllSessionsButton(sessions);
      for (const session of sessions) {
        if (isRowProcessed(session.row)) {
          continue;
        }
        markRowProcessed(session.row);
        loadCachedOrQueue(session, queue);
      }
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }

})();
