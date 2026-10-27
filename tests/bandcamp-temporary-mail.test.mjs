// Run with: node --experimental-transform-types tests/bandcamp-temporary-mail.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { TemporaryInbox } from '../src/userscripts/bandcamp-discography-downloader/utils/temporary-mail.ts';

const release = id => ({
    url: `https://artist.bandcamp.com/album/example-${id}`,
    tralbum: { current: { type: 'album', id } },
});
const realNow = Date.now;
const realWarn = console.warn;
console.warn = () => {};

// Minimal DOM surface used by email parsing and Bandcamp's embedded JSON reader.
globalThis.document = {
    createElement: () => ({
        set innerHTML(value) {
            this.value = value.replaceAll('&amp;', '&');
        },
        value: '',
    }),
};
globalThis.DOMParser = class {
    parseFromString(body) {
        let data;
        try {
            data = JSON.parse(body);
        } catch {}
        return {
            querySelectorAll: selector =>
                selector === 'a[href]'
                    ? [...body.matchAll(/href="([^"]+)"/g)].map(match => ({ href: match[1] }))
                    : [{ textContent: JSON.stringify({ offers: { price: 0 } }) }],
            querySelector: selector => {
                if (selector === 'script[data-tralbum]') return { getAttribute: () => JSON.stringify(data.tralbum) };
                if (selector === '[data-payment]') return { dataset: { payment: JSON.stringify(data.payment) } };
                if (selector === '#pagedata[data-blob]') return { dataset: { blob: body } };
                return null;
            },
        };
    }
};

function harness({
    primaryFailure,
    fallbackFailure,
    bandcampFailure,
    cancel,
    rejectPrimary,
    malformedPrimary,
    primaryNeverDelivers,
    recognizesCookie = false,
    existingCookie = '',
} = {}) {
    let clock = 0;
    Date.now = () => clock;
    globalThis.window = {
        setTimeout(callback, delay) {
            clock += delay;
            return setTimeout(callback, 0);
        },
        clearTimeout,
    };
    const calls = [];
    const requests = [];
    const sent = [];
    let cookie = existingCookie;
    Object.defineProperty(document, 'cookie', {
        configurable: true,
        get: () => cookie,
        set: value => {
            cookie = value.split(';')[0];
        },
    });
    let address;
    globalThis.GM_xmlhttpRequest = options => {
        const url = new URL(options.url);
        calls.push(url);
        requests.push(options);
        let status = 200;
        let body;
        let responseHeaders = '';
        if (url.hostname === 'api.guerrillamail.com') {
            const operation = url.searchParams.get('f');
            if (cancel) cancel.abort();
            if (operation === primaryFailure) status = 521;
            if (operation === 'get_email_address')
                body = malformedPrimary ? {} : { email_addr: 'primary@example.org', sid_token: 'session' };
            if (operation === 'check_email')
                body = {
                    list: (primaryNeverDelivers ? [] : sent).map(id => ({
                        mail_id: id,
                        mail_from: 'noreply@bandcamp.com',
                        mail_subject: 'Your download',
                    })),
                };
            if (operation === 'fetch_email')
                body = {
                    mail_body: `<a href="https://bandcamp.com/download?id=${url.searchParams.get('email_id')}">Download</a>`,
                };
        } else if (url.hostname === 'api.mail.tm') {
            if (fallbackFailure) status = 503;
            if (url.pathname === '/domains')
                body = { 'hydra:member': [{ domain: 'example.net', isActive: true, isPrivate: false }] };
            else if (url.pathname === '/accounts') {
                address = JSON.parse(options.data).address;
                body = { address };
            } else if (url.pathname === '/token') body = { token: 'test-token' };
            else {
                assert.equal(options.headers.Authorization, 'Bearer test-token');
                if (url.pathname === '/messages')
                    body = {
                        'hydra:member': sent.map(id => ({
                            id: String(id),
                            from: { address: 'noreply@bandcamp.com' },
                            subject: 'Your download',
                        })),
                    };
                else
                    body = {
                        html: [
                            `<a href="https://bandcamp.com/download?id=${url.pathname.split('/').at(-1)}">Download</a>`,
                        ],
                    };
            }
        } else if (url.pathname.startsWith('/album/')) {
            const id = Number(url.pathname.split('-').at(-1));
            assert.equal(options.headers['Cache-Control'], 'no-cache');
            body = {
                tralbum: {
                    current: { type: 'album', id, title: `Release ${id}` },
                    id,
                    hasAudio: true,
                    trackinfo: [],
                    url: url.href,
                },
                payment: {
                    paymentDownloadPage:
                        recognizesCookie && options.cookie?.startsWith('payments=')
                            ? `https://bandcamp.com/download?id=${id}`
                            : null,
                },
            };
        } else if (url.pathname === '/email_download') {
            const params = new URLSearchParams(options.data);
            if (bandcampFailure) status = 500;
            sent.push(Number(params.get('item_id')));
            body = { ok: !(rejectPrimary && params.get('address') === 'primary@example.org') };
        } else if (url.pathname === '/download') {
            if (recognizesCookie)
                responseHeaders =
                    'Set-Cookie: payments=1%09signed-value%09signature; domain=.bandcamp.com; path=/; expires=Thu, 29 Oct 2026 15:12:29 GMT';
            body = {
                digital_items: [
                    {
                        item_id: Number(url.searchParams.get('id')),
                        type: 'album',
                        downloads: { flac: { url: 'https://example.org/file.zip' } },
                    },
                ],
            };
        } else throw new Error(`Unexpected request ${url}`);
        queueMicrotask(() =>
            options.onload({ status, responseText: JSON.stringify(body), responseHeaders, finalUrl: url.href }),
        );
        return { abort() {} };
    };
    return { calls, requests, sent };
}

test('primary remains preferred when healthy', async () => {
    const { calls } = harness();
    const result = await new TemporaryInbox().resolveDownload(release(1), () => {});
    assert.equal(result.itemId, 1);
    assert.ok(!calls.some(url => url.hostname === 'api.mail.tm'));
});

for (const primaryFailure of ['get_email_address', 'check_email', 'fetch_email']) {
    test(`falls back after HTTP 521 in ${primaryFailure}`, async () => {
        const { calls, sent } = harness({ primaryFailure });
        const inbox = new TemporaryInbox();
        const results = await Promise.all([1, 2, 3].map(id => inbox.resolveDownload(release(id), () => {})));
        assert.deepEqual(
            results.map(result => result.itemId),
            [1, 2, 3],
        );
        assert.equal(calls.filter(url => url.hostname === 'api.mail.tm' && url.pathname === '/accounts').length, 1);
        assert.equal(calls.filter(url => url.searchParams.get('f') === 'get_email_address').length, 1);
        if (primaryFailure !== 'get_email_address')
            assert.equal(
                sent.length,
                4,
                'retries the first release with fallback; later releases skip the failed provider',
            );
        const primaryCalls = calls.filter(url => url.hostname === 'api.guerrillamail.com').length;
        await inbox.resolveDownload(release(4), () => {});
        assert.equal(
            calls.filter(url => url.hostname === 'api.guerrillamail.com').length,
            primaryCalls,
            'skips failed provider for later releases',
        );
    });
}

test('falls back when primary mail never arrives', async () => {
    harness({ primaryNeverDelivers: true });
    assert.equal((await new TemporaryInbox().resolveDownload(release(1), () => {})).itemId, 1);
});

test('malformed primary mailbox response triggers fallback', async () => {
    harness({ malformedPrimary: true });
    assert.equal((await new TemporaryInbox().resolveDownload(release(1), () => {})).itemId, 1);
});

test('rejected primary address triggers fallback', async () => {
    harness({ rejectPrimary: true });
    assert.equal((await new TemporaryInbox().resolveDownload(release(1), () => {})).itemId, 1);
});

test('reports both providers when all fail', async () => {
    harness({ primaryFailure: 'get_email_address', fallbackFailure: true });
    await assert.rejects(
        new TemporaryInbox().resolveDownload(release(1), () => {}),
        error => {
            assert.ok(error instanceof AggregateError);
            assert.match(error.message, /Guerrilla Mail.*521.*Mail.tm.*503/);
            return true;
        },
    );
});

test('Bandcamp HTTP errors do not trigger mailbox fallback', async () => {
    const { calls } = harness({ bandcampFailure: true });
    await assert.rejects(
        new TemporaryInbox().resolveDownload(release(1), () => {}),
        /500/,
    );
    assert.ok(!calls.some(url => url.hostname === 'api.mail.tm'));
});

test('cancellation stops without trying fallback', async () => {
    const cancel = new AbortController();
    const { calls } = harness({ cancel });
    await assert.rejects(
        new TemporaryInbox(cancel.signal).resolveDownload(release(1), () => {}),
        { name: 'AbortError' },
    );
    assert.ok(!calls.some(url => url.hostname === 'api.mail.tm'));
});

test('reuses authorization already in the browser without contacting either mailbox service', async () => {
    const { calls, sent, requests } = harness({
        recognizesCookie: true,
        existingCookie: 'payments=existing-signature',
    });
    const result = await new TemporaryInbox().resolveDownload(release(1), () => {});
    assert.equal(result.itemId, 1);
    assert.deepEqual(sent, []);
    assert.ok(calls.every(url => url.hostname.endsWith('bandcamp.com')));
    assert.equal(requests[0].cookie, 'payments=existing-signature');
});

test('requests email when Bandcamp does not recognize the existing cookie for this release', async () => {
    const { sent, requests } = harness({ existingCookie: 'payments=another-artist-or-expired-token' });
    assert.equal((await new TemporaryInbox().resolveDownload(release(1), () => {})).itemId, 1);
    assert.deepEqual(sent, [1]);
    assert.ok(
        requests
            .filter(request => new URL(request.url).hostname === 'api.guerrillamail.com')
            .every(request => request.cookie === undefined),
    );
});

test('fallback mailbox confirmation also authorizes the rest of the artist queue', async () => {
    const { sent, calls } = harness({ primaryFailure: 'get_email_address', recognizesCookie: true });
    const inbox = new TemporaryInbox();
    const results = await Promise.all([1, 2, 3].map(id => inbox.resolveDownload(release(id), () => {})));
    assert.deepEqual(
        results.map(result => result.itemId),
        [1, 2, 3],
    );
    assert.deepEqual(sent, [1]);
    assert.equal(calls.filter(url => url.hostname === 'api.mail.tm' && url.pathname === '/accounts').length, 1);
});

test('persists email authorization and skips email for concurrent and later releases', async () => {
    const { calls, sent, requests } = harness({ recognizesCookie: true });
    const inbox = new TemporaryInbox();
    const results = await Promise.all([1, 2, 3].map(id => inbox.resolveDownload(release(id), () => {})));
    assert.deepEqual(
        results.map(result => result.itemId),
        [1, 2, 3],
    );
    assert.deepEqual(sent, [1], 'only the first release requests an email');
    assert.equal(document.cookie, 'payments=1%09signed-value%09signature');
    assert.ok(
        requests
            .filter(request => new URL(request.url).hostname === 'api.guerrillamail.com')
            .every(request => request.cookie === undefined),
    );
    const mailboxCalls = calls.filter(url => url.hostname === 'api.guerrillamail.com').length;
    assert.equal((await new TemporaryInbox().resolveDownload(release(4), () => {})).itemId, 4);
    assert.equal(calls.filter(url => url.hostname === 'api.guerrillamail.com').length, mailboxCalls);
    document.cookie = '';
    assert.equal((await new TemporaryInbox().resolveDownload(release(5), () => {})).itemId, 5);
    assert.deepEqual(sent, [1, 5], 'expired or removed authorization requests email again');
});

test('cancellation also stops releases waiting for the artist confirmation', async () => {
    const cancel = new AbortController();
    const { calls } = harness({ cancel });
    const inbox = new TemporaryInbox(cancel.signal);
    const results = await Promise.allSettled([1, 2, 3].map(id => inbox.resolveDownload(release(id), () => {})));
    assert.ok(results.every(result => result.status === 'rejected' && result.reason.name === 'AbortError'));
    assert.equal(calls.filter(url => url.pathname.startsWith('/album/')).length, 1);
});

test.after(() => {
    Date.now = realNow;
    console.warn = realWarn;
});
