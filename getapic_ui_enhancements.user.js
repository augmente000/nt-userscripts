// ==UserScript==
// @name         Getapic UI Enhancements
// @description  Add UI enhancements to getapic.me session list pages
// @version      2026.07.03.1
// @author       987982598734
// @namespace    https://update.greasyfork.org/scripts/585345
// @downloadURL  https://update.greasyfork.org/scripts/585345/getapic_ui_enhancements.user.js
// @updateURL    https://update.greasyfork.org/scripts/585345/getapic_ui_enhancements.user.js
// @match        https://getapic.me/v
// @match        https://getapic.me/v/*
// @match        https://getapic.me/v?*
// @grant        unsafeWindow
// @run-at       document-end
// @icon         https://www.google.com/s2/favicons?sz=64&domain=getapic.me
// ==/UserScript==

(function () {
  'use strict';

  function _arrayLikeToArray(r, a) {
    (null == a || a > r.length) && (a = r.length);
    for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e];
    return n;
  }
  function asyncGeneratorStep(n, t, e, r, o, a, c) {
    try {
      var i = n[a](c),
        u = i.value;
    } catch (n) {
      return void e(n);
    }
    i.done ? t(u) : Promise.resolve(u).then(r, o);
  }
  function _asyncToGenerator(n) {
    return function () {
      var t = this,
        e = arguments;
      return new Promise(function (r, o) {
        var a = n.apply(t, e);
        function _next(n) {
          asyncGeneratorStep(a, r, o, _next, _throw, "next", n);
        }
        function _throw(n) {
          asyncGeneratorStep(a, r, o, _next, _throw, "throw", n);
        }
        _next(void 0);
      });
    };
  }
  function _classCallCheck(a, n) {
    if (!(a instanceof n)) throw new TypeError("Cannot call a class as a function");
  }
  function _defineProperties(e, r) {
    for (var t = 0; t < r.length; t++) {
      var o = r[t];
      o.enumerable = o.enumerable || false, o.configurable = true, "value" in o && (o.writable = true), Object.defineProperty(e, _toPropertyKey(o.key), o);
    }
  }
  function _createClass(e, r, t) {
    return r && _defineProperties(e.prototype, r), Object.defineProperty(e, "prototype", {
      writable: false
    }), e;
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
  function _defineProperty(e, r, t) {
    return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, {
      value: t,
      enumerable: true,
      configurable: true,
      writable: true
    }) : e[r] = t, e;
  }
  function _regenerator() {
    /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */
    var e,
      t,
      r = "function" == typeof Symbol ? Symbol : {},
      n = r.iterator || "@@iterator",
      o = r.toStringTag || "@@toStringTag";
    function i(r, n, o, i) {
      var c = n && n.prototype instanceof Generator ? n : Generator,
        u = Object.create(c.prototype);
      return _regeneratorDefine(u, "_invoke", function (r, n, o) {
        var i,
          c,
          u,
          f = 0,
          p = o || [],
          y = false,
          G = {
            p: 0,
            n: 0,
            v: e,
            a: d,
            f: d.bind(e, 4),
            d: function (t, r) {
              return i = t, c = 0, u = e, G.n = r, a;
            }
          };
        function d(r, n) {
          for (c = r, u = n, t = 0; !y && f && !o && t < p.length; t++) {
            var o,
              i = p[t],
              d = G.p,
              l = i[2];
            r > 3 ? (o = l === n) && (u = i[(c = i[4]) ? 5 : (c = 3, 3)], i[4] = i[5] = e) : i[0] <= d && ((o = r < 2 && d < i[1]) ? (c = 0, G.v = n, G.n = i[1]) : d < l && (o = r < 3 || i[0] > n || n > l) && (i[4] = r, i[5] = n, G.n = l, c = 0));
          }
          if (o || r > 1) return a;
          throw y = true, n;
        }
        return function (o, p, l) {
          if (f > 1) throw TypeError("Generator is already running");
          for (y && 1 === p && d(p, l), c = p, u = l; (t = c < 2 ? e : u) || !y;) {
            i || (c ? c < 3 ? (c > 1 && (G.n = -1), d(c, u)) : G.n = u : G.v = u);
            try {
              if (f = 2, i) {
                if (c || (o = "next"), t = i[o]) {
                  if (!(t = t.call(i, u))) throw TypeError("iterator result is not an object");
                  if (!t.done) return t;
                  u = t.value, c < 2 && (c = 0);
                } else 1 === c && (t = i.return) && t.call(i), c < 2 && (u = TypeError("The iterator does not provide a '" + o + "' method"), c = 1);
                i = e;
              } else if ((t = (y = G.n < 0) ? u : r.call(n, G)) !== a) break;
            } catch (t) {
              i = e, c = 1, u = t;
            } finally {
              f = 1;
            }
          }
          return {
            value: t,
            done: y
          };
        };
      }(r, o, i), true), u;
    }
    var a = {};
    function Generator() {}
    function GeneratorFunction() {}
    function GeneratorFunctionPrototype() {}
    t = Object.getPrototypeOf;
    var c = [][n] ? t(t([][n]())) : (_regeneratorDefine(t = {}, n, function () {
        return this;
      }), t),
      u = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(c);
    function f(e) {
      return Object.setPrototypeOf ? Object.setPrototypeOf(e, GeneratorFunctionPrototype) : (e.__proto__ = GeneratorFunctionPrototype, _regeneratorDefine(e, o, "GeneratorFunction")), e.prototype = Object.create(u), e;
    }
    return GeneratorFunction.prototype = GeneratorFunctionPrototype, _regeneratorDefine(u, "constructor", GeneratorFunctionPrototype), _regeneratorDefine(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = "GeneratorFunction", _regeneratorDefine(GeneratorFunctionPrototype, o, "GeneratorFunction"), _regeneratorDefine(u), _regeneratorDefine(u, o, "Generator"), _regeneratorDefine(u, n, function () {
      return this;
    }), _regeneratorDefine(u, "toString", function () {
      return "[object Generator]";
    }), (_regenerator = function () {
      return {
        w: i,
        m: f
      };
    })();
  }
  function _regeneratorDefine(e, r, n, t) {
    var i = Object.defineProperty;
    try {
      i({}, "", {});
    } catch (e) {
      i = 0;
    }
    _regeneratorDefine = function (e, r, n, t) {
      function o(r, n) {
        _regeneratorDefine(e, r, function (e) {
          return this._invoke(r, n, e);
        });
      }
      r ? i ? i(e, r, {
        value: n,
        enumerable: !t,
        configurable: !t,
        writable: !t
      }) : e[r] = n : (o("next", 0), o("throw", 1), o("return", 2));
    }, _regeneratorDefine(e, r, n, t);
  }
  function _toPrimitive(t, r) {
    if ("object" != typeof t || !t) return t;
    var e = t[Symbol.toPrimitive];
    if (void 0 !== e) {
      var i = e.call(t, r);
      if ("object" != typeof i) return i;
      throw new TypeError("@@toPrimitive must return a primitive value.");
    }
    return (String )(t);
  }
  function _toPropertyKey(t) {
    var i = _toPrimitive(t, "string");
    return "symbol" == typeof i ? i : i + "";
  }
  function _unsupportedIterableToArray(r, a) {
    if (r) {
      if ("string" == typeof r) return _arrayLikeToArray(r, a);
      var t = {}.toString.call(r).slice(8, -1);
      return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0;
    }
  }

  var SESSION_ROW_ID_PATTERN = /^set-(\d+)$/;
  var ALL_PREVIEWS_LABEL = 'Все HTML превью';
  function extractSessionsFromTable(table) {
    var sessions = [];
    var _iterator = _createForOfIteratorHelper(table.querySelectorAll('tbody tr[id^="set-"]')),
      _step;
    try {
      for (_iterator.s(); !(_step = _iterator.n()).done;) {
        var _link$getAttribute;
        var row = _step.value;
        var match = SESSION_ROW_ID_PATTERN.exec(row.id);
        if (!match) {
          continue;
        }
        var link = row.querySelector('td a[href^="/rs/"]');
        if (!link) {
          continue;
        }
        sessions.push({
          sessionId: match[1],
          url: new URL((_link$getAttribute = link.getAttribute('href')) !== null && _link$getAttribute !== void 0 ? _link$getAttribute : '', location.origin).href,
          row: row
        });
      }
    } catch (err) {
      _iterator.e(err);
    } finally {
      _iterator.f();
    }
    return sessions;
  }
  function findAllPreviewsTextarea(doc) {
    var _iterator2 = _createForOfIteratorHelper(doc.querySelectorAll('li')),
      _step2;
    try {
      for (_iterator2.s(); !(_step2 = _iterator2.n()).done;) {
        var _label$textContent;
        var li = _step2.value;
        var label = li.querySelector('span');
        if (!(label !== null && label !== void 0 && (_label$textContent = label.textContent) !== null && _label$textContent !== void 0 && _label$textContent.includes(ALL_PREVIEWS_LABEL))) {
          continue;
        }
        var textarea = li.querySelector('textarea.form-control');
        if (textarea) {
          return textarea;
        }
      }
    } catch (err) {
      _iterator2.e(err);
    } finally {
      _iterator2.f();
    }
    return null;
  }
  function extractPreviewHtmlFromPage(html) {
    var _textarea$textContent;
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var textarea = findAllPreviewsTextarea(doc);
    if (!textarea) {
      return '';
    }
    return textarea.value.trim() || ((_textarea$textContent = textarea.textContent) === null || _textarea$textContent === void 0 ? void 0 : _textarea$textContent.trim()) || '';
  }

  var STORAGE_PREFIX = 'nt-getapic-previews:';
  /** ~6 weeks — middle of the requested 1–2 month range */
  var CACHE_TTL_MS = 45 * 24 * 60 * 60 * 1000;
  function storageKey(sessionId) {
    return "".concat(STORAGE_PREFIX).concat(sessionId);
  }
  function getStorage() {
    return unsafeWindow.localStorage;
  }
  function getCachedPreviews(sessionId) {
    var raw = getStorage().getItem(storageKey(sessionId));
    if (!raw) {
      return null;
    }
    try {
      var cached = JSON.parse(raw);
      if (typeof cached.html !== 'string' || typeof cached.fetchedAt !== 'number') {
        return null;
      }
      if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) {
        getStorage().removeItem(storageKey(sessionId));
        return null;
      }
      return cached.html;
    } catch (_unused) {
      getStorage().removeItem(storageKey(sessionId));
      return null;
    }
  }
  function setCachedPreviews(sessionId, html) {
    var entry = {
      html: html,
      fetchedAt: Date.now()
    };
    getStorage().setItem(storageKey(sessionId), JSON.stringify(entry));
  }
  function clearCachedPreviews(sessionId) {
    getStorage().removeItem(storageKey(sessionId));
  }

  function fetchSessionPreviews(_x) {
    return _fetchSessionPreviews.apply(this, arguments);
  }
  function _fetchSessionPreviews() {
    _fetchSessionPreviews = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee(sessionUrl) {
      var response, html;
      return _regenerator().w(function (_context) {
        while (1) switch (_context.n) {
          case 0:
            _context.n = 1;
            return fetch(sessionUrl, {
              method: 'GET',
              credentials: 'same-origin'
            });
          case 1:
            response = _context.v;
            if (response.ok) {
              _context.n = 2;
              break;
            }
            throw new Error("Failed to fetch session: ".concat(response.status));
          case 2:
            _context.n = 3;
            return response.text();
          case 3:
            html = _context.v;
            return _context.a(2, extractPreviewHtmlFromPage(html));
        }
      }, _callee);
    }));
    return _fetchSessionPreviews.apply(this, arguments);
  }
  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  var PREVIEW_CELL_CLASS = 'nt-getapic-preview-cell';
  var PREVIEW_CONTAINER_CLASS = 'nt-getapic-previews';
  var MARKER_ATTR = 'data-nt-getapic-previews';
  function ensurePreviewColumn(table) {
    if (table.querySelector(".".concat(PREVIEW_CELL_CLASS))) {
      return;
    }
    var headerRow = table.querySelector('thead tr');
    if (headerRow) {
      var header = document.createElement('th');
      header.textContent = 'Превью';
      headerRow.appendChild(header);
    }
  }
  function getOrCreatePreviewCell(row) {
    var cell = row.querySelector(".".concat(PREVIEW_CELL_CLASS));
    if (cell) {
      return cell;
    }
    cell = document.createElement('td');
    cell.className = PREVIEW_CELL_CLASS;
    row.appendChild(cell);
    return cell;
  }
  function createRefreshButton(onRefresh) {
    var button = document.createElement('button');
    button.type = 'button';
    button.textContent = '↻';
    button.title = 'Обновить превью';
    Object.assign(button.style, {
      marginLeft: '6px',
      padding: '0 4px',
      fontSize: '12px',
      lineHeight: '1.2',
      cursor: 'pointer',
      verticalAlign: 'middle'
    });
    button.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      onRefresh();
    });
    return button;
  }
  function stylePreviewImages(container) {
    var _iterator = _createForOfIteratorHelper(container.querySelectorAll('img')),
      _step;
    try {
      for (_iterator.s(); !(_step = _iterator.n()).done;) {
        var img = _step.value;
        img.loading = 'lazy';
        Object.assign(img.style, {
          maxHeight: '80px',
          maxWidth: '120px',
          margin: '2px',
          objectFit: 'contain',
          verticalAlign: 'middle'
        });
      }
    } catch (err) {
      _iterator.e(err);
    } finally {
      _iterator.f();
    }
  }
  function renderLoadingState(row) {
    var cell = getOrCreatePreviewCell(row);
    cell.textContent = '…';
    cell.style.color = '#888';
    cell.style.fontSize = '12px';
  }
  function renderErrorState(row, onRefresh) {
    var cell = getOrCreatePreviewCell(row);
    cell.replaceChildren();
    var label = document.createElement('span');
    label.textContent = 'ошибка';
    label.style.color = '#c00';
    label.style.fontSize = '12px';
    cell.append(label, createRefreshButton(onRefresh));
  }
  function renderPreviews(row, previewHtml, onRefresh) {
    var cell = getOrCreatePreviewCell(row);
    cell.replaceChildren();
    cell.style.color = '';
    var container = document.createElement('span');
    container.className = PREVIEW_CONTAINER_CLASS;
    Object.assign(container.style, {
      display: 'inline-flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: '2px',
      maxWidth: '420px'
    });
    if (!previewHtml) {
      var empty = document.createElement('span');
      empty.textContent = '—';
      empty.style.color = '#888';
      empty.style.fontSize = '12px';
      container.append(empty);
    } else {
      container.insertAdjacentHTML('beforeend', previewHtml);
      stylePreviewImages(container);
    }
    container.appendChild(createRefreshButton(onRefresh));
    cell.appendChild(container);
  }
  function isRowProcessed(row) {
    return row.hasAttribute(MARKER_ATTR);
  }
  function markRowProcessed(row) {
    row.setAttribute(MARKER_ATTR, '1');
  }

  var FETCH_INTERVAL_MS = 1000;
  var PreviewFetchQueue = /*#__PURE__*/function () {
    function PreviewFetchQueue() {
      _classCallCheck(this, PreviewFetchQueue);
      _defineProperty(this, "pending", []);
      _defineProperty(this, "processing", false);
    }
    return _createClass(PreviewFetchQueue, [{
      key: "enqueue",
      value: function enqueue(session) {
        this.pending.push(session);
        void this.process();
      }
    }, {
      key: "refresh",
      value: function refresh(session) {
        clearCachedPreviews(session.sessionId);
        renderLoadingState(session.row);
        this.enqueue(session);
      }
    }, {
      key: "process",
      value: function () {
        var _process = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee() {
          var session;
          return _regenerator().w(function (_context) {
            while (1) switch (_context.n) {
              case 0:
                if (!this.processing) {
                  _context.n = 1;
                  break;
                }
                return _context.a(2);
              case 1:
                this.processing = true;
              case 2:
                if (!(this.pending.length > 0)) {
                  _context.n = 4;
                  break;
                }
                session = this.pending.shift();
                void this.fetchAndRender(session);
                if (!(this.pending.length > 0)) {
                  _context.n = 3;
                  break;
                }
                _context.n = 3;
                return sleep(FETCH_INTERVAL_MS);
              case 3:
                _context.n = 2;
                break;
              case 4:
                this.processing = false;
              case 5:
                return _context.a(2);
            }
          }, _callee, this);
        }));
        function process() {
          return _process.apply(this, arguments);
        }
        return process;
      }()
    }, {
      key: "fetchAndRender",
      value: function () {
        var _fetchAndRender = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee2(session) {
          var _this = this;
          var previewHtml;
          return _regenerator().w(function (_context2) {
            while (1) switch (_context2.p = _context2.n) {
              case 0:
                _context2.p = 0;
                _context2.n = 1;
                return fetchSessionPreviews(session.url);
              case 1:
                previewHtml = _context2.v;
                setCachedPreviews(session.sessionId, previewHtml);
                renderPreviews(session.row, previewHtml, function () {
                  _this.refresh(session);
                });
                _context2.n = 3;
                break;
              case 2:
                _context2.p = 2;
                _context2.v;
                renderErrorState(session.row, function () {
                  _this.refresh(session);
                });
              case 3:
                return _context2.a(2);
            }
          }, _callee2, null, [[0, 2]]);
        }));
        function fetchAndRender(_x) {
          return _fetchAndRender.apply(this, arguments);
        }
        return fetchAndRender;
      }()
    }]);
  }();
  function loadCachedOrQueue(session, queue) {
    var cached = getCachedPreviews(session.sessionId);
    if (cached !== null) {
      renderPreviews(session.row, cached, function () {
        queue.refresh(session);
      });
      return;
    }
    renderLoadingState(session.row);
    queue.enqueue(session);
  }

  var TABLE_SELECTOR = 'table.table.table-striped.table-bordered.table-hover.table-condensed';
  function init() {
    var table = document.querySelector(TABLE_SELECTOR);
    if (!table) {
      return;
    }
    ensurePreviewColumn(table);
    var queue = new PreviewFetchQueue();
    var _iterator = _createForOfIteratorHelper(extractSessionsFromTable(table)),
      _step;
    try {
      for (_iterator.s(); !(_step = _iterator.n()).done;) {
        var session = _step.value;
        if (isRowProcessed(session.row)) {
          continue;
        }
        markRowProcessed(session.row);
        loadCachedOrQueue(session, queue);
      }
    } catch (err) {
      _iterator.e(err);
    } finally {
      _iterator.f();
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
