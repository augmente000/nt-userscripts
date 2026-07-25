// ==UserScript==
// @name         Bandcamp Discography Pruner
// @description  Persistently hides selected releases from Bandcamp discography pages.
// @version      2026.07.26.2
// @author       
// @namespace    https://update.greasyfork.org/scripts/588560
// @downloadURL  https://update.greasyfork.org/scripts/588560/bandcamp-discography-pruner.user.js
// @updateURL    https://update.greasyfork.org/scripts/588560/bandcamp-discography-pruner.user.js
// @match        https://*.bandcamp.com/
// @match        https://*.bandcamp.com/music*
// @grant        none
// @run-at       document-start
// @icon         https://s4.bcbits.com/img/favicon/favicon-32x32.png
// ==/UserScript==

(function () {
    'use strict';

    const GRID_SELECTOR = '#music-grid';
    const ITEM_SELECTOR = `${GRID_SELECTOR} > li.music-grid-item`;
    const ACTION_BUTTON_CLASS = 'nt-discography-pruner-action';
    const CONTROLS_CLASS = 'nt-discography-pruner-controls';
    const TOGGLE_CLASS = 'nt-discography-pruner-toggle';
    const PRUNED_CLASS = 'nt-discography-pruner-hidden';
    const SHOW_HIDDEN_CLASS = 'nt-discography-pruner-show-hidden';
    const STYLE_ID = 'nt-discography-pruner-styles';
    const CSS = `
    ${ITEM_SELECTOR} {
        position: relative;
    }

    ${ITEM_SELECTOR}.${PRUNED_CLASS} {
        display: none !important;
    }

    ${GRID_SELECTOR}.${SHOW_HIDDEN_CLASS} > li.music-grid-item.${PRUNED_CLASS} {
        display: inline-block !important;
        opacity: 0.72;
        filter: grayscale(75%);
    }

    ${GRID_SELECTOR}.${SHOW_HIDDEN_CLASS} > li.music-grid-item.${PRUNED_CLASS}::after {
        position: absolute;
        z-index: 1;
        inset: 0;
        border: 2px dashed rgb(175 45 45 / 80%);
        content: "";
        pointer-events: none;
    }

    .${CONTROLS_CLASS} {
        display: flex;
        gap: 7px;
        align-items: center;
        margin: 0 0 14px;
    }

    .${TOGGLE_CLASS} {
        padding: 5px 9px;
        color: #333;
        font: 600 12px/1.2 Arial, sans-serif;
        background: #fff;
        border: 1px solid rgb(0 0 0 / 25%);
        border-radius: 3px;
        box-shadow: 0 1px 2px rgb(0 0 0 / 10%);
        cursor: pointer;
    }

    .${TOGGLE_CLASS}:hover:not(:disabled) {
        border-color: rgb(0 0 0 / 50%);
    }

    .${TOGGLE_CLASS}[aria-pressed="true"] {
        color: #fff;
        background: #555;
        border-color: #555;
    }

    .${TOGGLE_CLASS}:disabled {
        cursor: default;
        opacity: 0.5;
    }

    .${TOGGLE_CLASS}:focus-visible,
    .${ACTION_BUTTON_CLASS}:focus-visible {
        outline: 2px solid currentColor;
        outline-offset: 2px;
    }

    .${ACTION_BUTTON_CLASS} {
        position: absolute;
        z-index: 2;
        top: 6px;
        right: 6px;
        display: grid;
        width: 24px;
        height: 24px;
        padding: 0;
        place-items: center;
        color: #fff;
        background: rgb(0 0 0 / 68%);
        border: 0;
        border-radius: 4px;
        box-shadow: 0 1px 4px rgb(0 0 0 / 35%);
        cursor: pointer;
        opacity: 0.72;
    }

    .${ACTION_BUTTON_CLASS}:hover {
        background: #c33;
        opacity: 1;
    }

    .${ACTION_BUTTON_CLASS}[data-action="restore"] {
        color: #222;
        background: #fff;
        opacity: 1;
    }

    .${ACTION_BUTTON_CLASS}[data-action="restore"]:hover {
        color: #fff;
        background: #278247;
    }

    .${ACTION_BUTTON_CLASS} svg {
        width: 14px;
        height: 14px;
        pointer-events: none;
    }
`;
    function addStyles() {
      if (document.getElementById(STYLE_ID)) {
        return;
      }
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.append(style);
    }

    const STORAGE_KEY = `nt-discography-pruner:hidden:${location.hostname}`;
    function loadHiddenIds() {
      try {
        const storedValue = localStorage.getItem(STORAGE_KEY);
        if (!storedValue) {
          return new Set();
        }
        const parsedValue = JSON.parse(storedValue);
        if (!Array.isArray(parsedValue)) {
          return new Set();
        }
        return new Set(parsedValue.filter(value => typeof value === 'string'));
      } catch {
        return new Set();
      }
    }
    function saveHiddenIds(hiddenIds) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...hiddenIds]));
      } catch {
        // Pruning still works for the current page if storage is unavailable.
      }
    }
    function getItemId(item) {
      return item.dataset['itemId'];
    }
    function getItemName(item) {
      const title = item.querySelector('.title');
      if (!title) {
        return 'this release';
      }
      for (const node of title.childNodes) {
        const name = node.nodeType === Node.TEXT_NODE ? node.textContent?.trim() : undefined;
        if (name) {
          return name;
        }
      }
      return 'this release';
    }
    function createActionButton(item, action, onClick) {
      const button = document.createElement('button');
      const itemName = getItemName(item);
      const isRestore = action === 'restore';
      const actionLabel = isRestore ? `Restore ${itemName}` : `Hide ${itemName}`;
      button.type = 'button';
      button.className = ACTION_BUTTON_CLASS;
      button.dataset['action'] = action;
      button.title = actionLabel;
      button.setAttribute('aria-label', actionLabel);
      button.innerHTML = isRestore ? `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M7.4 7H16a5 5 0 0 1 0 10h-5v-2h5a3 3 0 0 0 0-6H7.4l3.3 3.3-1.4 1.4L3.6 8l5.7-5.7 1.4 1.4L7.4 7Z"/>
            </svg>
        ` : `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h10l-1 12H8L7 9Zm3 2v7h2v-7h-2Zm4 0v7h2v-7h-2Z"/>
            </svg>
        `;
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      });
      return button;
    }
    function getHiddenItemCount(items, hiddenIds) {
      return items.filter(item => {
        const itemId = getItemId(item);
        return itemId !== undefined && hiddenIds.has(itemId);
      }).length;
    }
    function formatHiddenButtonLabel(isShowing, count) {
      const action = isShowing ? 'Collapse' : 'Show';
      const noun = count === 1 ? 'Item' : 'Items';
      return `${action} ${count} Hidden ${noun}`;
    }
    function init() {
      const grid = document.querySelector(GRID_SELECTOR);
      if (!grid) {
        return;
      }
      const musicGrid = grid;
      addStyles();
      const items = [...document.querySelectorAll(ITEM_SELECTOR)];
      const hiddenIds = loadHiddenIds();
      const controls = document.createElement('div');
      const pruneToggle = document.createElement('button');
      const hiddenToggle = document.createElement('button');
      let isPruneEnabled = false;
      let isShowingHidden = false;
      controls.className = CONTROLS_CLASS;
      pruneToggle.type = 'button';
      pruneToggle.className = TOGGLE_CLASS;
      pruneToggle.textContent = 'Enable Prune';
      pruneToggle.setAttribute('aria-controls', 'music-grid');
      pruneToggle.setAttribute('aria-pressed', 'false');
      hiddenToggle.type = 'button';
      hiddenToggle.className = TOGGLE_CLASS;
      hiddenToggle.setAttribute('aria-controls', 'music-grid');
      hiddenToggle.setAttribute('aria-pressed', 'false');
      function render() {
        for (const item of items) {
          item.querySelector(`:scope > .${ACTION_BUTTON_CLASS}`)?.remove();
          const itemId = getItemId(item);
          const isHidden = itemId !== undefined && hiddenIds.has(itemId);
          item.classList.toggle(PRUNED_CLASS, isHidden);
          if (isHidden && isShowingHidden) {
            item.append(createActionButton(item, 'restore', () => {
              if (itemId !== undefined) {
                hiddenIds.delete(itemId);
                saveHiddenIds(hiddenIds);
                render();
              }
            }));
          } else if (!isHidden && isPruneEnabled && itemId !== undefined) {
            item.append(createActionButton(item, 'prune', () => {
              hiddenIds.add(itemId);
              saveHiddenIds(hiddenIds);
              render();
            }));
          }
        }
        const hiddenCount = getHiddenItemCount(items, hiddenIds);
        if (hiddenCount === 0) {
          isShowingHidden = false;
        }
        musicGrid.classList.toggle(SHOW_HIDDEN_CLASS, isShowingHidden);
        hiddenToggle.textContent = formatHiddenButtonLabel(isShowingHidden, hiddenCount);
        hiddenToggle.disabled = hiddenCount === 0;
        hiddenToggle.setAttribute('aria-pressed', String(isShowingHidden));
      }
      pruneToggle.addEventListener('click', () => {
        isPruneEnabled = !isPruneEnabled;
        pruneToggle.textContent = isPruneEnabled ? 'Disable Prune' : 'Enable Prune';
        pruneToggle.setAttribute('aria-pressed', String(isPruneEnabled));
        render();
      });
      hiddenToggle.addEventListener('click', () => {
        isShowingHidden = !isShowingHidden;
        render();
      });
      controls.append(pruneToggle, hiddenToggle);
      musicGrid.before(controls);
      render();
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init, {
        once: true
      });
    } else {
      init();
    }

})();
