// These hooks must run in the page realm, before the inline WM-Shield script.
// Match the detector's callback bodies, not arbitrary timers or DOM observers:
// React, download polling, and the site's verification widget need those APIs.
const sourceOf = Function.prototype.toString;

function source(callback: unknown): string {
    return typeof callback === 'function' ? sourceOf.call(callback) : '';
}

function isShieldTask(callback: unknown): boolean {
    const code = source(callback);
    return (
        (code.includes('probarAdsJs') && code.includes('vigilarGpt')) ||
        (code.includes('muroActivo') && code.includes('wall(')) ||
        (code.includes('muroActivo') && code.includes('attachShadow')) ||
        (code.includes('ceboRedFallos') && code.includes('__ADS_OK')) ||
        (code.includes('esBloqueador') && code.includes('pulso(')) ||
        (code.includes('pub_300x250') && code.includes('offsetHeight'))
    );
}

const page: Window = window;
const nativeTimeout = page.setTimeout;
const nativeInterval = page.setInterval;
page.setTimeout = function (handler: TimerHandler, timeout?: number, ...args: unknown[]): number {
    // Return a real, cancellable timer ID without retaining the blocked closure.
    return nativeTimeout.call(this, isShieldTask(handler) ? () => {} : handler, timeout, ...args);
};
page.setInterval = function (handler: TimerHandler, timeout?: number, ...args: unknown[]): number {
    if (isShieldTask(handler)) return nativeTimeout.call(this, () => {}, 0);
    return nativeInterval.call(this, handler, timeout, ...args);
};

const nativeAddListener = EventTarget.prototype.addEventListener;
EventTarget.prototype.addEventListener = function (type, listener, options): void {
    const code = source(listener);
    const shieldStartup = type === 'DOMContentLoaded' && isShieldTask(listener);
    const focusTrap = type === 'focusin' && code.includes('btnMuro') && code.includes('preventScroll');
    const adLoader = code.includes('securepubads.g.doubleclick.net/tag/js/gpt.js') && code.includes('__ADS_OK');
    if (shieldStartup || focusTrap || adLoader) return;
    nativeAddListener.call(this, type, listener, options);
};

const NativeObserver = window.MutationObserver;
window.MutationObserver = class extends NativeObserver {
    constructor(callback: MutationCallback) {
        super(isShieldTask(callback) ? () => {} : callback);
    }
};

// Keep references to closed roots without changing their mode or exposing them.
// This also lets the fallback recognize the wall if startup ever changes.
const closedRoots = new WeakMap<Element, ShadowRoot>();
const nativeAttachShadow = Element.prototype.attachShadow;
Element.prototype.attachShadow = function (options): ShadowRoot {
    const root = nativeAttachShadow.call(this, options);
    closedRoots.set(this, root);
    return root;
};

function isWall(element: Element): boolean {
    // WM-Shield appends a random <wXXXXXX-XXXXXX> directly under <html>.
    if (!/^w[a-z0-9]{1,6}-[a-z0-9]{1,6}$/i.test(element.localName)) return false;
    const style = (element as HTMLElement).style;
    if (style.position !== 'fixed' || style.zIndex !== '2147483647') return false;
    const root = closedRoots.get(element) ?? element.shadowRoot;
    if (root) return !!root.querySelector('[role="alertdialog"][aria-modal="true"]');
    // A closed root created before this userscript is inaccessible. The random
    // tag, placement, and wall-specific inline styles identify that case.
    return style.getPropertyValue('all') === 'initial' && style.pointerEvents === 'auto';
}

function removeWall(): void {
    const html = document.documentElement;
    if (!html) return;
    let removed = false;
    for (const child of Array.from(html.children)) {
        if (!isWall(child)) continue;
        child.remove();
        removed = true;
    }
    if (!removed) return;
    for (const element of [html, document.body]) {
        if (!element) continue;
        element.style.removeProperty('overflow');
        element.style.removeProperty('visibility');
    }
}

// Observe only direct children: the wall lives outside the React root. Do not
// rescan the whole app on every search result or progress update.
const cleanup = new NativeObserver(removeWall);
function startCleanup(): void {
    if (!document.documentElement) return;
    cleanup.disconnect();
    cleanup.observe(document.documentElement, { childList: true });
    removeWall();
}
if (document.documentElement) startCleanup();
if (!document.documentElement) {
    const bootstrap = new NativeObserver(() => {
        if (!document.documentElement) return;
        bootstrap.disconnect();
        startCleanup();
    });
    bootstrap.observe(document, { childList: true });
}
