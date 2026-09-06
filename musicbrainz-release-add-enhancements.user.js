// ==UserScript==
// @name         MusicBrainz Release Add Enhancements
// @description  Adds label and catalog-number autofill, Guess Case normalization, and duplicate release-group controls to the MusicBrainz release add page.
// @version      2026.09.06.1
// @author       
// @namespace    https://github.com/augmente000/nt-userscripts
// @downloadURL  https://raw.githubusercontent.com/augmente000/nt-userscripts/dist/musicbrainz-release-add-enhancements.user.js
// @updateURL    https://raw.githubusercontent.com/augmente000/nt-userscripts/dist/musicbrainz-release-add-enhancements.user.js
// @match        https://*.musicbrainz.org/release/add*
// @grant        none
// @run-at       document-idle
// @icon         https://musicbrainz.org/static/images/favicons/favicon-32x32.png
// ==/UserScript==

(function () {
    'use strict';

    function setInputValue(input, value) {
      input.value = value;
      input.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        data: value,
        inputType: 'insertFromPaste'
      }));
    }

    const POLL_INTERVAL_MS = 500;
    function annotationText() {
      return document.querySelector('#annotation')?.value;
    }
    function executePattern(pattern, value) {
      pattern.lastIndex = 0;
      return pattern.exec(value);
    }
    function labelIdForValue(value, labels) {
      const normalizedValue = value.toLowerCase();
      for (const label of labels) {
        if (value === label.id || label.names.some(name => name.toLowerCase() === normalizedValue)) {
          return label.id;
        }
      }
      return undefined;
    }
    function findLabel(options) {
      const labelInputs = Array.from(document.querySelectorAll('input[id^="label-"]'));
      let labelInput;
      let labelId;
      for (const input of labelInputs) {
        const matchingLabelId = labelIdForValue(input.value.trim(), options.labels);
        if (matchingLabelId) {
          labelInput = input;
          labelId = matchingLabelId;
          break;
        }
      }
      if (!labelInput) {
        labelInput = labelInputs.find(input => !input.value.trim());
        labelId = options.defaultLabelId;
      }
      if (!labelInput || !labelId) {
        return undefined;
      }
      const row = labelInput.closest('tr');
      const catalogNumberInput = row?.querySelector('input[id^="catno-"]');
      if (!row || !catalogNumberInput) {
        return undefined;
      }
      if (labelInput.value.trim() !== labelId) {
        setInputValue(labelInput, labelId);
      }
      return {
        catalogNumberInput,
        row
      };
    }
    function initLabelAutofill(options) {
      let addedLabel;
      let pollInterval;
      const annotationInputListener = event => {
        if (event.target instanceof HTMLTextAreaElement && event.target.id === 'annotation') {
          update();
        }
      };
      const stopWatching = () => {
        document.removeEventListener('input', annotationInputListener, true);
        if (pollInterval !== undefined) {
          window.clearInterval(pollInterval);
          pollInterval = undefined;
        }
      };
      const update = () => {
        const annotation = annotationText();
        if (!annotation || !executePattern(options.annotationPattern, annotation)) {
          return;
        }
        if (!addedLabel?.row.isConnected) {
          addedLabel = findLabel(options);
          if (!addedLabel) {
            return;
          }
        }
        const catalogNumber = executePattern(options.catalogNumberPattern, annotation)?.[1]?.trim();
        if (!catalogNumber) {
          return;
        }
        if (!addedLabel.catalogNumberInput.value.trim()) {
          setInputValue(addedLabel.catalogNumberInput, catalogNumber);
        }
        stopWatching();
      };
      document.addEventListener('input', annotationInputListener, true);
      pollInterval = window.setInterval(update, POLL_INTERVAL_MS);
      update();
    }

    const ATTENUATION_CIRCUIT_MBID = 'd3f44125-8caa-42ff-bcaf-477a9b4a1258';
    function initAttenuationCircuitAutofill() {
      initLabelAutofill({
        annotationPattern: /\battenuation\s+circuit\b/iu,
        catalogNumberPattern: /\battenuation\s+circuit\s*[°•]\s*([^°•\r\n]+?)\s*[°•]/iu,
        defaultLabelId: ATTENUATION_CIRCUIT_MBID,
        labels: [{
          id: ATTENUATION_CIRCUIT_MBID,
          names: ['attenuation circuit']
        }]
      });
    }

    const CONTROL_ROW_CLASS = 'nt-duplicate-release-groups-control';
    const DUPLICATE_LIST_SELECTOR = '.duplicate-release-groups-list';
    const DUPLICATE_ROW_ID = 'nt-duplicate-release-groups';
    function addStyles() {
      const style = document.createElement('style');
      style.textContent = `
        .${CONTROL_ROW_CLASS} {
            height: 24px;
        }

        .${CONTROL_ROW_CLASS} > td {
            box-sizing: border-box;
            height: 24px;
            padding-bottom: 2px !important;
            padding-top: 2px !important;
        }

        .${CONTROL_ROW_CLASS} button {
            box-sizing: border-box;
            font-size: 11px;
            height: 20px;
            line-height: 18px;
            padding: 0 6px;
            vertical-align: top;
            white-space: nowrap;
            width: 190px;
        }

        .${CONTROL_ROW_CLASS} button.nt-has-duplicates {
            background-color: #fff2cc;
            border-color: #e59b18;
            box-shadow: 0 0 5px rgb(229 155 24 / 65%);
            color: #704500;
        }

        .${CONTROL_ROW_CLASS} button.nt-has-duplicates:hover,
        .${CONTROL_ROW_CLASS} button.nt-has-duplicates:focus-visible {
            background-color: #ffe7a3;
            border-color: #c77d00;
            box-shadow: 0 0 7px rgb(229 155 24 / 80%);
        }
    `;
      document.head.append(style);
    }
    function updateButton(button, hidden, duplicateCount) {
      const hasDuplicates = duplicateCount > 0;
      button.disabled = !hasDuplicates;
      button.classList.toggle('nt-has-duplicates', hasDuplicates);
      button.setAttribute('aria-expanded', String(hasDuplicates && !hidden));
      const action = !hasDuplicates || hidden ? 'Show' : 'Hide';
      const count = hasDuplicates ? ` (${duplicateCount})` : '';
      const text = `${action} similar release groups${count}`;
      if (button.textContent !== text) {
        button.textContent = text;
      }
    }
    function createControlRow(onToggle) {
      const controlRow = document.createElement('tr');
      controlRow.className = CONTROL_ROW_CLASS;
      const spacerCell = document.createElement('td');
      const controlCell = document.createElement('td');
      controlCell.colSpan = 2;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'styled-button';
      button.disabled = true;
      button.textContent = 'Show similar release groups';
      button.setAttribute('aria-controls', DUPLICATE_ROW_ID);
      button.setAttribute('aria-expanded', 'false');
      button.addEventListener('click', onToggle);
      controlCell.append(button);
      controlRow.append(spacerCell, controlCell);
      return controlRow;
    }
    function findDuplicateRow() {
      return document.querySelector(DUPLICATE_LIST_SELECTOR)?.closest('tr') ?? undefined;
    }
    function countDuplicates(row) {
      return row?.querySelectorAll(`${DUPLICATE_LIST_SELECTOR} > label:not(:last-child)`).length ?? 0;
    }
    function initDuplicateReleaseGroupsToggle() {
      let controlRow;
      let duplicatesHidden = true;
      const update = () => {
        if (!controlRow?.isConnected) {
          const releaseGroupRow = document.querySelector('#release-group')?.closest('tr');
          if (!releaseGroupRow) {
            return;
          }
          controlRow = createControlRow(() => {
            duplicatesHidden = !duplicatesHidden;
            update();
          });
          releaseGroupRow.after(controlRow);
        }
        const duplicateRow = findDuplicateRow();
        if (duplicateRow) {
          duplicateRow.id = DUPLICATE_ROW_ID;
          duplicateRow.hidden = duplicatesHidden;
        }
        const loadingRow = document.querySelector('.duplicate-release-groups-loading')?.closest('tr');
        if (loadingRow) {
          loadingRow.hidden = true;
        }
        const button = controlRow.querySelector('button');
        if (button) {
          updateButton(button, duplicatesHidden, countDuplicates(duplicateRow));
        }
      };
      let updatePending = false;
      const scheduleUpdate = () => {
        if (updatePending) {
          return;
        }
        updatePending = true;
        queueMicrotask(() => {
          updatePending = false;
          update();
        });
      };
      addStyles();
      update();
      new MutationObserver(scheduleUpdate).observe(document.body, {
        childList: true,
        subtree: true
      });
    }

    const GUESS_CASE_BUTTON_SELECTOR = 'button.guesscase-title, #guess-case-button, button[data-bind*="guessMediumCase"]';
    const TITLE_INPUT_SELECTOR = 'input.track-name, input[id^="medium-title-"]';
    const bracketOnlyPreviewValues = new WeakMap();
    function normalizeSquareBrackets(value) {
      return value.replaceAll('[', '(').replaceAll(']', ')');
    }
    function individualTitleInput(button) {
      const trackTitle = button.closest('tr')?.querySelector('input.track-name');
      if (trackTitle) {
        return trackTitle;
      }
      return button.parentElement?.querySelector('input[type="text"]') ?? undefined;
    }
    function affectedTitleInputs(button) {
      if (button.id === 'guess-case-button') {
        return Array.from(document.querySelectorAll(`#tracklist ${TITLE_INPUT_SELECTOR}`));
      }
      if (button.matches('[data-bind*="guessMediumCase"]')) {
        return Array.from(button.closest('.advanced-medium')?.querySelectorAll(TITLE_INPUT_SELECTOR) ?? []);
      }
      const input = individualTitleInput(button);
      return input ? [input] : [];
    }
    function normalizeInputs(inputs) {
      for (const input of inputs) {
        const normalized = normalizeSquareBrackets(input.value);
        if (normalized !== input.value) {
          setInputValue(input, normalized);
        }
      }
    }
    function normalizePreviewInputs(button, inputs) {
      const originalValues = new Map();
      for (const input of inputs) {
        const normalized = normalizeSquareBrackets(input.value);
        if (normalized === input.value) {
          continue;
        }
        if (!input.classList.contains('preview')) {
          originalValues.set(input, input.value);
          input.classList.add('preview');
        }
        input.value = normalized;
      }
      if (originalValues.size > 0) {
        bracketOnlyPreviewValues.set(button, originalValues);
      }
    }
    function restoreBracketOnlyPreview(button) {
      const originalValues = bracketOnlyPreviewValues.get(button);
      if (!originalValues) {
        return;
      }
      for (const [input, originalValue] of originalValues) {
        input.value = originalValue;
        input.classList.remove('preview');
      }
      bracketOnlyPreviewValues.delete(button);
    }
    function commitBracketOnlyPreview(button) {
      const originalValues = bracketOnlyPreviewValues.get(button);
      if (!originalValues) {
        return;
      }
      for (const input of originalValues.keys()) {
        input.classList.remove('preview');
      }
      bracketOnlyPreviewValues.delete(button);
    }
    function guessCaseButton(event) {
      if (!(event.target instanceof Element)) {
        return undefined;
      }
      return event.target.closest(GUESS_CASE_BUTTON_SELECTOR) ?? undefined;
    }
    function initGuessCaseBracketNormalization() {
      document.addEventListener('click', event => {
        const button = guessCaseButton(event);
        if (!button) {
          return;
        }
        commitBracketOnlyPreview(button);
        queueMicrotask(() => normalizeInputs(affectedTitleInputs(button)));
      });
      document.addEventListener('mouseover', event => {
        const button = guessCaseButton(event);
        if (!button || event.relatedTarget instanceof Node && button.contains(event.relatedTarget)) {
          return;
        }
        queueMicrotask(() => normalizePreviewInputs(button, affectedTitleInputs(button)));
      });
      document.addEventListener('mouseout', event => {
        const button = guessCaseButton(event);
        if (!button || event.relatedTarget instanceof Node && button.contains(event.relatedTarget)) {
          return;
        }
        queueMicrotask(() => restoreBracketOnlyPreview(button));
      });
    }

    const MILIEU_MUSIC_MBID = '30166e7a-d7ca-4b32-9e22-2228958db577';
    const MILIEU_MUSIC_DIGITAL_MBID = '51e69c25-113c-4052-b430-837f9eebb3ac';
    function initMilieuMusicAutofill() {
      initLabelAutofill({
        annotationPattern: /\bMilieu\s+Music\b/iu,
        catalogNumberPattern: /\bMilieu\s+Music\s+number\s+([^\s,.;:!?()[\]{}]+)/iu,
        defaultLabelId: MILIEU_MUSIC_DIGITAL_MBID,
        labels: [{
          id: MILIEU_MUSIC_MBID,
          names: ['Milieu Music']
        }, {
          id: MILIEU_MUSIC_DIGITAL_MBID,
          names: ['Milieu Music Digital']
        }]
      });
    }

    function isReleaseAddPage() {
      return window.location.pathname === '/release/add';
    }
    function init() {
      if (!isReleaseAddPage()) {
        return;
      }
      initMilieuMusicAutofill();
      initAttenuationCircuitAutofill();
      initDuplicateReleaseGroupsToggle();
      initGuessCaseBracketNormalization();
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init, {
        once: true
      });
    } else {
      init();
    }

})();
