import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';

const script = stripTypeScriptTypes(
    readFileSync(new URL('../src/userscripts/flacdownloader-unblock/index.ts', import.meta.url), 'utf8'),
);
const shield = readFileSync(new URL('./fixtures/flacdownloader-wm-shield.js', import.meta.url), 'utf8');
const adLoader = readFileSync(new URL('./fixtures/flacdownloader-ad-loader.js', import.meta.url), 'utf8');

// A deterministic DOM/timer harness for the actual captured scripts. No network
// requests are sent and no dependency on the ignored tmp/ page is required.
function browser(readyState = 'loading') {
    let now = 100_000;
    let nextTimer = 0;
    const timers = new Map();
    const observers = [];
    const requests = [];
    const beacons = [];
    const focus = [];
    const storage = new Map([['_wg', '1']]);
    class EventTarget {
        listeners = new Map();
        addEventListener(type, callback) {
            const listeners = this.listeners.get(type) ?? [];
            listeners.push(callback);
            this.listeners.set(type, listeners);
        }
        removeEventListener(type, callback) {
            this.listeners.set(
                type,
                (this.listeners.get(type) ?? []).filter(fn => fn !== callback),
            );
        }
        dispatch(type, extra = {}) {
            for (const callback of [...(this.listeners.get(type) ?? [])]) callback({ target: this, ...extra });
        }
    }
    class Style {
        set cssText(value) {
            for (const declaration of value.split(';')) {
                const [key, val] = declaration.split(':');
                if (val) this.setProperty(key.trim(), val.replace(/!important/g, '').trim());
            }
        }
        setProperty(key, value) {
            this[key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
        }
        getPropertyValue(key) {
            return this[key] ?? '';
        }
        removeProperty(key) {
            delete this[key];
        }
    }
    class Element extends EventTarget {
        children = [];
        style = new Style();
        parentNode = null;
        className = '';
        constructor(name) {
            super();
            this.localName = name;
        }
        appendChild(child) {
            child.parentNode = this;
            this.children.push(child);
            return child;
        }
        remove() {
            if (!this.parentNode) return;
            this.parentNode.children = this.parentNode.children.filter(child => child !== this);
            this.parentNode = null;
        }
        setAttribute() {}
        contains(child) {
            return this.children.includes(child) || this.children.some(item => item.contains(child));
        }
        attachShadow(options) {
            const button = new Element('button');
            const root = {
                innerHTML: '',
                querySelector(selector) {
                    if (selector === 'button') return button;
                    return this.innerHTML.includes('role="alertdialog"') ? new Element('div') : null;
                },
            };
            if (options.mode === 'open') this.shadowRoot = root;
            return root;
        }
        focus() {
            focus.push(this);
        }
        get offsetHeight() {
            return this.className.includes('adsbox') ? 0 : 10;
        }
    }
    class MutationObserver {
        constructor(callback) {
            this.callback = callback;
            observers.push(this);
        }
        observe(target) {
            this.target = target;
        }
        disconnect() {
            this.target = null;
        }
    }
    const document = Object.assign(new EventTarget(), {
        readyState,
        documentElement: new Element('html'),
        head: new Element('head'),
        body: new Element('body'),
        visibilityState: 'visible',
        hasFocus: () => true,
        createElement: name => new Element(name),
    });
    document.documentElement.appendChild(document.head);
    document.documentElement.appendChild(document.body);
    const window = Object.assign(new EventTarget(), {
        Element,
        EventTarget,
        MutationObserver,
        document,
        console,
        URLSearchParams,
        Date: class extends Date {
            static now() {
                return now;
            }
        },
        navigator: {
            language: 'en',
            onLine: true,
            brave: { isBrave: () => Promise.resolve(true) },
            sendBeacon: (...args) => beacons.push(args),
        },
        location: { pathname: '/', search: '', href: 'https://flacdownloader.com/', reload() {} },
        localStorage: {
            getItem: key => storage.get(key) ?? null,
            setItem: (key, value) => storage.set(key, value),
        },
        getComputedStyle: element => ({
            display: element.className.includes('adsbox') ? 'none' : 'flex',
            visibility: 'visible',
            opacity: '1',
            pointerEvents: 'auto',
        }),
        fetch: async url => {
            requests.push(url);
            throw new Error('Blocked by browser');
        },
        setTimeout: (callback, delay = 0, ...args) => {
            const id = ++nextTimer;
            timers.set(id, { callback, at: now + delay, args });
            return id;
        },
        setInterval: (callback, delay = 0, ...args) => {
            const id = ++nextTimer;
            timers.set(id, { callback, at: now + delay, args, interval: delay });
            return id;
        },
        clearTimeout: id => timers.delete(id),
        clearInterval: id => timers.delete(id),
    });
    window.window = window;
    window.self = window;
    window.top = window;
    const context = vm.createContext(window);
    function mutations() {
        for (const observer of observers) if (observer.target) observer.callback([], observer);
    }
    async function advance(milliseconds) {
        const until = now + milliseconds;
        for (;;) {
            const next = [...timers].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
            if (!next) break;
            const [id, timer] = next;
            now = timer.at;
            if (timer.interval) timer.at += timer.interval;
            else timers.delete(id);
            timer.callback(...timer.args);
            mutations();
            await Promise.resolve();
        }
        now = until;
        await Promise.resolve();
    }
    return {
        window,
        document,
        requests,
        beacons,
        focus,
        observers,
        mutations,
        advance,
        run: code => vm.runInContext(code, context),
        walls: () => document.documentElement.children.filter(element => element.localName.startsWith('w')),
    };
}

test('captured shield detects blocking, restores removed walls, and hides the body', async () => {
    const page = browser();
    page.run(shield);
    page.document.dispatch('DOMContentLoaded');
    await page.advance(1000);
    assert.equal(page.walls().length, 1);
    assert.equal(page.document.body.style.overflow, 'hidden');
    for (let count = 0; count < 3; count++) {
        page.walls()[0].remove();
        page.mutations();
        await page.advance(1000);
        assert.equal(page.walls().length, 1);
    }
    assert.equal(page.document.body.style.visibility, 'hidden');
});

for (const state of ['loading', 'complete']) {
    test(`blocks the captured detector and ad loader with readyState=${state}`, async () => {
        const page = browser(state);
        page.run(script);
        page.run(adLoader);
        page.run(shield);
        page.document.dispatch('DOMContentLoaded');
        for (const type of ['pointerdown', 'mousemove', 'keydown', 'wheel', 'touchstart', 'scroll']) {
            page.window.dispatch(type);
        }
        await page.advance(180_000);
        assert.equal(page.walls().length, 0);
        assert.ok(
            page.document.head.children.every(element => element.src.startsWith('/ads.js?')),
            'no advertising scripts inserted (only the same-origin detector bait can start synchronously)',
        );
        if (state === 'loading') assert.equal(page.document.head.children.length, 0);
        assert.equal(page.requests.length, 0);
        assert.equal(page.beacons.length, 0, 'no anti-adblock telemetry');
        assert.equal(page.focus.length, 0);
        assert.equal(page.document.body.style.overflow, undefined);
        assert.equal(page.document.body.style.visibility, undefined);
    });
}

test('fallback removes closed-root walls and prevents their timer/observer/focus restoration', async () => {
    const page = browser();
    page.run(script);
    page.run(`
        var host, btnMuro;
        function muroActivo() { return host && document.documentElement.contains(host); }
        function bloquearScroll() { document.body.style.setProperty('overflow', 'hidden'); }
        function wall() {
            if (muroActivo()) return;
            host = document.createElement('wabc123-def456');
            host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;pointer-events:auto';
            var root = host.attachShadow({mode: 'closed'});
            root.innerHTML = '<div role="alertdialog" aria-modal="true"></div>';
            btnMuro = root.querySelector('button');
            document.documentElement.appendChild(host);
            bloquearScroll();
            document.body.style.setProperty('visibility', 'hidden');
        }
        wall();
        new MutationObserver(function() { if (!muroActivo()) wall(); }).observe(document.documentElement);
        setInterval(function() { if (!muroActivo()) wall(); else bloquearScroll(); }, 1000);
        document.addEventListener('focusin', function(e) {
            if (e.target !== host) btnMuro.focus({preventScroll: true});
        }, true);
    `);
    page.mutations();
    page.document.dispatch('focusin');
    await page.advance(5000);
    assert.equal(page.walls().length, 0);
    assert.equal(page.focus.length, 0);
    assert.equal(page.document.body.style.overflow, undefined);
    assert.equal(page.document.body.style.visibility, undefined);
});

test('preserves app timers, arguments, cancellation, events, observers, and closed widgets', async () => {
    const page = browser();
    page.run(script);
    page.run(`
        var calls = [], ticks = 0, changes = 0;
        document.addEventListener('DOMContentLoaded', () => calls.push('ready'));
        document.addEventListener('focusin', () => calls.push('focus'));
        new MutationObserver(() => changes++).observe(document.body);
        var interval = setInterval(() => ticks++, 1000);
        setTimeout((value) => { calls.push(value); clearInterval(interval); }, 2500, 'download');
        var cancelled = setTimeout(() => calls.push('cancelled'), 100);
        clearTimeout(cancelled);
        var widget = document.createElement('verification-widget');
        var widgetRoot = widget.attachShadow({ mode: 'closed' });
        widgetRoot.innerHTML = '<div role="alertdialog" aria-modal="true"></div>';
        document.documentElement.appendChild(widget);
    `);
    page.document.dispatch('DOMContentLoaded');
    page.document.dispatch('focusin');
    await page.advance(3000);
    assert.deepEqual(Array.from(page.run('calls')), ['ready', 'focus', 'download']);
    assert.equal(page.run('ticks'), 2);
    assert.ok(page.run('changes') > 0);
    assert.equal(page.run('widget.shadowRoot'), undefined);
    assert.ok(page.run('document.documentElement.contains(widget)'));
});
