// ==UserScript==
// @name         Search Bandcamp releases on trackers
// @description  Add a button on Bandcamp's album pages to search the album artist + album name on trackers
// @version      2026.07.01.2
// @author       987982598734
// @namespace    https://update.greasyfork.org/scripts/584978
// @downloadURL  https://update.greasyfork.org/scripts/584978/Search%20Bandcamp%20releases%20on%20trackers.user.js
// @updateURL    https://update.greasyfork.org/scripts/584978/Search%20Bandcamp%20releases%20on%20trackers.user.js
// @match        https://*.bandcamp.com/album/*
// @match        https://*.bandcamp.com/track/*
// @match        https://*/album/*
// @match        https://*/track/*
// @grant        unsafeWindow
// @run-at       document-end
// @icon         https://www.google.com/s2/favicons?sz=64&domain=bandcamp.com
// ==/UserScript==

(function () {
    'use strict';

    function getBandcampWindow() {
      /* oxlint-disable-next-line no-global-assign */
      if (typeof unsafeWindow === 'undefined') {
        return window;
      }
      return unsafeWindow;
    }
    function getReleaseData() {
      var _ref, _tralbum$artist, _mobile$byArtist, _ref2, _tralbum$current$titl, _tralbum$current;
      var pageWindow = getBandcampWindow();
      var tralbum = pageWindow.TralbumData;
      var mobile = pageWindow.TralbumJSONLD;
      var artist = (_ref = (_tralbum$artist = tralbum === null || tralbum === void 0 ? void 0 : tralbum.artist) !== null && _tralbum$artist !== void 0 ? _tralbum$artist : mobile === null || mobile === void 0 || (_mobile$byArtist = mobile.byArtist) === null || _mobile$byArtist === void 0 ? void 0 : _mobile$byArtist.name) !== null && _ref !== void 0 ? _ref : '';
      var title = (_ref2 = (_tralbum$current$titl = tralbum === null || tralbum === void 0 || (_tralbum$current = tralbum.current) === null || _tralbum$current === void 0 ? void 0 : _tralbum$current.title) !== null && _tralbum$current$titl !== void 0 ? _tralbum$current$titl : mobile === null || mobile === void 0 ? void 0 : mobile.name) !== null && _ref2 !== void 0 ? _ref2 : '';
      if (!artist || !title) {
        return null;
      }
      return {
        artist: artist.trim(),
        title: title.trim()
      };
    }

    function _arrayLikeToArray(r, a) {
      (null == a || a > r.length) && (a = r.length);
      for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e];
      return n;
    }
    function _arrayWithHoles(r) {
      if (Array.isArray(r)) return r;
    }
    function _createForOfIteratorHelper(r, e) {
      var t = "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"];
      if (!t) {
        if (Array.isArray(r) || (t = _unsupportedIterableToArray(r)) || e) {
          t && (r = t);
          var n = 0,
            F = function () {};
          return {
            s: F,
            n: function () {
              return n >= r.length ? {
                done: true
              } : {
                done: false,
                value: r[n++]
              };
            },
            e: function (r) {
              throw r;
            },
            f: F
          };
        }
        throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
      }
      var o,
        a = true,
        u = false;
      return {
        s: function () {
          t = t.call(r);
        },
        n: function () {
          var r = t.next();
          return a = r.done, r;
        },
        e: function (r) {
          u = true, o = r;
        },
        f: function () {
          try {
            a || null == t.return || t.return();
          } finally {
            if (u) throw o;
          }
        }
      };
    }
    function _iterableToArrayLimit(r, l) {
      var t = null == r ? null : "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"];
      if (null != t) {
        var e,
          n,
          i,
          u,
          a = [],
          f = true,
          o = false;
        try {
          if (i = (t = t.call(r)).next, 0 === l) ; else for (; !(f = (e = i.call(t)).done) && (a.push(e.value), a.length !== l); f = !0);
        } catch (r) {
          o = true, n = r;
        } finally {
          try {
            if (!f && null != t.return && (u = t.return(), Object(u) !== u)) return;
          } finally {
            if (o) throw n;
          }
        }
        return a;
      }
    }
    function _nonIterableRest() {
      throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
    }
    function _slicedToArray(r, e) {
      return _arrayWithHoles(r) || _iterableToArrayLimit(r, e) || _unsupportedIterableToArray(r, e) || _nonIterableRest();
    }
    function _unsupportedIterableToArray(r, a) {
      if (r) {
        if ("string" == typeof r) return _arrayLikeToArray(r, a);
        var t = {}.toString.call(r).slice(8, -1);
        return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0;
      }
    }

    var ICON_RUTRACKER = 'https://rutracker.me/favicon.ico';
    var ICON_RED = 'https://redacted.sh/favicon.ico';
    var ICON_NNM = 'https://nnmclub.to/favicon.ico';
    var ICON_NEWTEAM = 'https://new-team.org/favicon.ico';
    var ICON_ORPHEUS = 'https://orpheus.network/favicon.ico';
    var TRACKERS = [{
      id: 'rutracker',
      name: 'RuTracker',
      label: 'RTO',
      icon: ICON_RUTRACKER,
      color: '#408294',
      hoverColor: '#2f6573',
      method: 'get',
      buildUrl: function buildUrl(query) {
        return "https://rutracker.me/forum/tracker.php?".concat(new URLSearchParams({
          nm: query
        }).toString());
      }
    }, {
      id: 'red',
      name: 'RED',
      label: 'RED',
      icon: ICON_RED,
      color: '#c0392b',
      hoverColor: '#962d22',
      method: 'get',
      buildUrl: function buildUrl(query, mode) {
        return mode === 'artist' ? "https://redacted.sh/artist.php?".concat(new URLSearchParams({
          artistname: query
        }).toString()) : "https://redacted.sh/torrents.php?".concat(new URLSearchParams({
          searchstr: query
        }).toString());
      }
    }, {
      id: 'nnm',
      name: 'NNM-Club',
      label: 'NNM',
      icon: ICON_NNM,
      color: '#5b7a1c',
      hoverColor: '#445a15',
      method: 'post',
      action: 'https://nnmclub.to/forum/tracker.php',
      acceptCharset: 'windows-1251',
      fields: function fields(query) {
        return {
          f: '-1',
          nm: query,
          search_submit: 'Искать'
        };
      }
    }, {
      id: 'newteam',
      name: 'New-Team',
      label: 'NT',
      icon: ICON_NEWTEAM,
      color: '#8e44ad',
      hoverColor: '#6c3483',
      method: 'get',
      buildUrl: function buildUrl(query) {
        return "https://new-team.org/search?".concat(new URLSearchParams({
          q: query
        }).toString());
      }
    }, {
      id: 'orpheus',
      name: 'Orpheus',
      label: 'OPS',
      icon: ICON_ORPHEUS,
      color: '#d35400',
      hoverColor: '#a84300',
      method: 'get',
      buildUrl: function buildUrl(query, mode) {
        return mode === 'artist' ? "https://orpheus.network/artist.php?".concat(new URLSearchParams({
          artistname: query
        }).toString()) : "https://orpheus.network/torrents.php?".concat(new URLSearchParams({
          searchstr: query
        }).toString());
      }
    }];
    var GROUPS = [{
      idSuffix: 'release',
      caption: 'Artist + Release',
      buildQuery: function buildQuery(release) {
        return "".concat(release.artist, " ").concat(release.title);
      }
    }, {
      idSuffix: 'artist',
      caption: 'Artist',
      buildQuery: function buildQuery(release) {
        return release.artist;
      }
    }];

    function applyButtonStyle(element, tracker) {
      Object.assign(element.style, {
        display: 'inline-block',
        marginRight: '6px',
        padding: '3px 8px',
        border: "1px solid ".concat(tracker.color),
        borderRadius: '3px',
        background: tracker.color,
        color: '#fff',
        fontSize: '11px',
        fontWeight: 'bold',
        textDecoration: 'none',
        lineHeight: 'normal',
        fontFamily: 'inherit',
        cursor: 'pointer',
        transition: 'background 0.15s ease, border-color 0.15s ease'
      });
      element.addEventListener('mouseenter', function () {
        element.style.background = tracker.hoverColor;
        element.style.borderColor = tracker.hoverColor;
      });
      element.addEventListener('mouseleave', function () {
        element.style.background = tracker.color;
        element.style.borderColor = tracker.color;
      });
    }
    function setButtonContent(element, tracker) {
      if (tracker.icon) {
        var img = document.createElement('img');
        img.src = tracker.icon;
        img.alt = '';
        Object.assign(img.style, {
          width: '14px',
          height: '14px',
          marginRight: '5px',
          verticalAlign: 'middle'
        });
        element.appendChild(img);
      }
      var label = document.createElement('span');
      label.textContent = tracker.label;
      label.style.verticalAlign = 'middle';
      element.appendChild(label);
    }
    function buildButton(tracker, query, idSuffix) {
      var titleText = "Search \"".concat(query, "\" on ").concat(tracker.name, " (opens in a new tab)");
      if (tracker.method === 'post') {
        var form = document.createElement('form');
        form.id = "".concat(tracker.id, "_").concat(idSuffix);
        form.method = 'post';
        form.action = tracker.action;
        form.target = '_blank';
        form.style.display = 'inline-block';
        form.style.margin = '0';
        if (tracker.acceptCharset) {
          form.acceptCharset = tracker.acceptCharset;
        }
        var fields = tracker.fields(query);
        for (var _i = 0, _Object$entries = Object.entries(fields); _i < _Object$entries.length; _i++) {
          var _Object$entries$_i = _slicedToArray(_Object$entries[_i], 2),
            fieldName = _Object$entries$_i[0],
            fieldValue = _Object$entries$_i[1];
          var input = document.createElement('input');
          input.type = 'hidden';
          input.name = fieldName;
          input.value = fieldValue;
          form.appendChild(input);
        }
        var button = document.createElement('button');
        button.type = 'submit';
        button.title = titleText;
        applyButtonStyle(button, tracker);
        setButtonContent(button, tracker);
        form.appendChild(button);
        return form;
      }
      var link = document.createElement('a');
      link.id = "".concat(tracker.id, "_").concat(idSuffix);
      link.href = tracker.buildUrl(query, idSuffix);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.title = titleText;
      applyButtonStyle(link, tracker);
      setButtonContent(link, tracker);
      return link;
    }
    function buildGroup(group, release) {
      var container = document.createElement('div');
      Object.assign(container.style, {
        border: '1px solid rgba(0, 0, 0, 0.15)',
        borderRadius: '4px',
        padding: '6px 8px'
      });
      var caption = document.createElement('div');
      caption.textContent = group.caption;
      Object.assign(caption.style, {
        fontSize: '10px',
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        opacity: '0.6',
        marginBottom: '5px'
      });
      container.appendChild(caption);
      var query = group.buildQuery(release);
      var _iterator = _createForOfIteratorHelper(TRACKERS),
        _step;
      try {
        for (_iterator.s(); !(_step = _iterator.n()).done;) {
          var tracker = _step.value;
          container.appendChild(buildButton(tracker, query, group.idSuffix));
        }
      } catch (err) {
        _iterator.e(err);
      } finally {
        _iterator.f();
      }
      return container;
    }
    function buildSearchGroups(release) {
      var groupsRow = document.createElement('div');
      Object.assign(groupsRow.style, {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px',
        alignItems: 'flex-start'
      });
      var _iterator2 = _createForOfIteratorHelper(GROUPS),
        _step2;
      try {
        for (_iterator2.s(); !(_step2 = _iterator2.n()).done;) {
          var group = _step2.value;
          groupsRow.appendChild(buildGroup(group, release));
        }
      } catch (err) {
        _iterator2.e(err);
      } finally {
        _iterator2.f();
      }
      return groupsRow;
    }

    var CONTAINER_ID = 'bc_tracker_search';
    function insertButton(release) {
      // don't insert on non-release pages
      var anchor = document.querySelector('div.trackView');
      if (!anchor) {
        return;
      }

      // if the our UI already exists, return early
      if (document.getElementById(CONTAINER_ID)) {
        return;
      }

      // Prepare our UI element
      var wrapper = document.createElement('div');
      wrapper.id = CONTAINER_ID;
      wrapper.style.marginBlock = '24px';
      var header = document.createElement('div');
      header.textContent = 'Search';
      Object.assign(header.style, {
        fontSize: '16px',
        fontWeight: 'bold',
        marginBottom: '6px'
      });
      wrapper.appendChild(header);
      wrapper.appendChild(buildSearchGroups(release));

      // Insert it
      anchor.insertAdjacentElement('beforebegin', wrapper);
    }

    function init() {
      var release = getReleaseData();
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

})();
