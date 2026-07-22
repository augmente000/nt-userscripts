# Scripts

## Bandcamp Collection Downloader

A userscript for saving free or purchased Bandcamp releases in lossless FLAC format.

The script adds **Download All** to artist root and `/music` pages, and **Download** to individual album and track pages. It supports:

- direct free downloads;
- downloads previously authorized by email for the artist or label;
- email-gated free/name-your-price downloads, using a temporary Guerrilla Mail inbox;
- releases in the logged-in Bandcamp user's collection.

Albums use Bandcamp's zipped FLAC download. Standalone tracks are saved as a ZIP containing the FLAC and cover artwork. Discography downloads run with at most three active releases, and a compact floating panel shows progress and can stop the active queue. Paid releases outside the user's collection are skipped.

### Screenshots

| Floating panel                                                                      | Release download                                                                 |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| ![Bandcamp Collection Downloader floating panel](docs/bcd-img1-floating-bubble.png) | ![Download button on a Bandcamp release page](docs/bcd-img2-download-button.png) |

| Download in progress                                                             | Download finished                                                          |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| ![Bandcamp release download in progress](docs/bcd-img3-download-in-progress.png) | ![Bandcamp release download finished](docs/bcd-img4-download-finished.png) |

| Collection download                                                                    | Collection in progress                                                                         | Collection stopped                                                                           |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| ![Download All button on a Bandcamp music page](docs/bcd-img5-download-collection.png) | ![Bandcamp collection download in progress](docs/bcd-img6-download-collection-in-progress.png) | ![Stopped Bandcamp collection download queue](docs/bcd-img7-download-collection-stopped.png) |

---

# Development

Install dependencies:

```sh
pnpm install
```

Build the userscript:

```sh
pnpm run build
```

Watch and rebuild while developing:

```sh
pnpm start
```

The built userscript is written to:

```text
dist/collection_downloader.user.js
```

## Checks

```sh
pnpm run type-check
pnpm run format:check
```
