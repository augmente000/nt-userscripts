# Bandcamp download authorization

Verified on 27 October 2026 using a disposable mailbox and [Slow Inner Lavender](https://milieumusic.bandcamp.com/track/slow-inner-lavender).

Opening the emailed `/download` URL returns an HTTP `Set-Cookie` header for `payments`, with domain `.bandcamp.com`, path `/`, and an expiry about 60 hours later. JavaScript and local storage are not needed to create it. Its URL-decoded value contains a version, a list of payment ID/token pairs, and a signature, separated by tabs. The ID in the new pair matches the download page's `payment_id`, rather than the track or artist ID. Preserve the whole value; adding entries manually invalidates its signature.

Sending the cookie back when loading the original track makes Bandcamp expose `paymentType: "email"` and a `paymentDownloadPage` in `[data-payment]`. The same cookie also exposed an authorized download URL for another release, Teibelian Fantasia III, on the artist's page. Bandcamp decides which releases a particular authorization covers.

The userscript explicitly copies the `payments` response cookie into the browser cookie jar and supplies the browser's current `payments` cookie to Bandcamp background requests. Other cookies remain managed by the browser/userscript manager. Temporary mailbox and artwork requests do not receive this explicit cookie. Before requesting email, it reloads release data without using a cached page. Releases waiting for the same artist's first confirmation then repeat this check.

## Browser verification

1. Update the userscript, open the artist page, and open Developer Tools → Application/Storage → Cookies. Locate `payments` under the Bandcamp domain.
2. Download one email-gated free release. Inspect the `/download` request opened from the email: its response should set `payments` for `.bandcamp.com`. Check that the cookie appears in browser storage with the server's expiry.
3. Download another free release from that artist, or repeat the download on the already open page. It should resolve an authorized download without contacting Guerrilla Mail or Mail.tm.
4. If it still requests email, inspect the refreshed release request. Its response HTML should contain `[data-payment]` with a nonempty `paymentDownloadPage`. If this is missing, Bandcamp has not recognized the cookie for that release. If the cookie never appears, check whether the userscript manager exposes `Set-Cookie` in `GM_xmlhttpRequest.responseHeaders` and whether browser privacy settings permit the cookie.

The cookie is intentionally saved with Bandcamp's expiry. Clearing cookies, using an incognito profile, or expiration can require email confirmation again. For troubleshooting, share cookie names, domain/path/expiry attributes, and whether `paymentDownloadPage` is present; raw cookies and download URLs are unnecessary.
