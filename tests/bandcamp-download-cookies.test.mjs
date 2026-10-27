// Run with: node --experimental-transform-types tests/bandcamp-download-cookies.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    paymentsCookie,
    rememberPaymentsCookie,
} from '../src/userscripts/bandcamp-discography-downloader/utils/download-cookies.ts';
import { requestText } from '../src/userscripts/bandcamp-discography-downloader/utils/network.ts';

const bandcamp = 'https://bandcamp.com/download';
const artist = 'https://artist.bandcamp.com/album/example';
const signed = '1%09%5B%5B123%2C%22token%22%5D%5D%09signature';
const serverCookie = `payments=${signed}; domain=.bandcamp.com; path=/; expires=Thu, 29 Oct 2026 15:12:29 GMT`;

function cookieJar(initial = '') {
    let cookies = initial;
    const writes = [];
    globalThis.document = {
        get cookie() {
            return cookies;
        },
        set cookie(value) {
            writes.push(value);
            cookies = value.split(';')[0];
        },
    };
    return writes;
}

test('uses only the browser payments cookie and only for HTTPS Bandcamp requests', () => {
    cookieJar(`identity=private; payments=${signed}; other=value`);
    assert.equal(paymentsCookie(artist), `payments=${signed}`);
    for (const url of [
        'https://api.guerrillamail.com/ajax.php',
        'https://api.mail.tm/messages',
        'https://f4.bcbits.com/img/art.jpg',
        'https://bandcamp.com.example.org/download',
        'http://artist.bandcamp.com/album/example',
    ])
        assert.equal(paymentsCookie(url), undefined);
});

test('copies the complete signed cookie, scope, and expiry without unrelated response cookies', () => {
    const writes = cookieJar('payments=old');
    rememberPaymentsCookie(
        bandcamp,
        bandcamp,
        `Set-Cookie: identity=private; path=/\r\nset-cookie: ${serverCookie}\r\nSet-Cookie: BACKENDID3=backend; path=/`,
    );
    assert.deepEqual(writes, [serverCookie]);
    assert.equal(paymentsCookie(artist), `payments=${signed}`);
});

test('does not accept download authorization from external requests or redirects', () => {
    const writes = cookieJar();
    rememberPaymentsCookie('https://example.org/', bandcamp, `Set-Cookie: ${serverCookie}`);
    rememberPaymentsCookie(bandcamp, 'https://example.org/', `Set-Cookie: ${serverCookie}`);
    assert.deepEqual(writes, []);
});

test('network requests pass existing authorization and persist the response cookie', async () => {
    const writes = cookieJar('payments=old');
    globalThis.GM_xmlhttpRequest = options => {
        assert.equal(options.cookie, 'payments=old');
        queueMicrotask(() =>
            options.onload({
                status: 200,
                responseText: 'download page',
                responseHeaders: `Set-Cookie: ${serverCookie}`,
                finalUrl: bandcamp,
            }),
        );
        return { abort() {} };
    };
    assert.equal(await requestText(bandcamp), 'download page');
    assert.deepEqual(writes, [serverCookie]);
});

test('failed responses do not overwrite authorization', async () => {
    const writes = cookieJar('payments=old');
    globalThis.GM_xmlhttpRequest = options => {
        queueMicrotask(() =>
            options.onload({
                status: 500,
                responseText: '',
                responseHeaders: `Set-Cookie: ${serverCookie}`,
                finalUrl: bandcamp,
            }),
        );
        return { abort() {} };
    };
    await assert.rejects(requestText(bandcamp), /500/);
    assert.deepEqual(writes, []);
});
