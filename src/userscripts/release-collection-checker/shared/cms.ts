import type { CmsRelease } from './types';

const API_URL = 'https://api.new-team.me/api/v1/releases';
const CMS_URL = 'https://cms.new-team.me/releases';
const API_TOKEN_STORAGE_KEY = 'releaseCollectionCheckerApiToken';

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class ApiAuthenticationError extends Error {}

export class CmsClient {
    private setupDismissed = false;

    configureToken(): string | null {
        const hasSavedToken = Boolean(GM_getValue(API_TOKEN_STORAGE_KEY, '').trim());
        const promptMessage = hasSavedToken
            ? 'Enter a new CMS API token. Cancel to keep the saved token.'
            : 'Enter the CMS API token used to check your collection:';
        const enteredToken = window.prompt(promptMessage);
        if (enteredToken === null) {
            return null;
        }

        const token = enteredToken.trim();
        if (!token) {
            window.alert('An API token is required. The saved token was not changed.');
            return null;
        }

        GM_setValue(API_TOKEN_STORAGE_KEY, token);
        this.setupDismissed = false;
        return token;
    }

    async findRelease(externalUrl: string): Promise<CmsRelease | null> {
        const token = this.getToken();
        if (!token) {
            return null;
        }

        return this.requestRelease(externalUrl, token);
    }

    getEditUrl(release: CmsRelease): string {
        return `${CMS_URL}/${encodeURIComponent(release.id)}/edit`;
    }

    private getToken(): string | null {
        const storedToken = GM_getValue(API_TOKEN_STORAGE_KEY, '').trim();
        if (storedToken) {
            return storedToken;
        }

        if (this.setupDismissed) {
            return null;
        }

        const token = this.configureToken();
        this.setupDismissed = token === null;
        return token;
    }

    private requestRelease(externalUrl: string, token: string): Promise<CmsRelease | null> {
        const url = new URL(API_URL);
        url.searchParams.set('externalUrl', externalUrl);

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url.href,
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/json',
                },
                responseType: 'text',
                timeout: 30_000,
                onload: response => {
                    if (response.status === 401 || response.status === 403) {
                        reject(new ApiAuthenticationError('The CMS API rejected the saved token.'));
                        return;
                    }

                    if (response.status < 200 || response.status >= 300) {
                        reject(new Error(`CMS API request failed with HTTP ${response.status}.`));
                        return;
                    }

                    try {
                        const responseText = typeof response.responseText === 'string' ? response.responseText : '';
                        const payload = JSON.parse(responseText) as unknown;
                        if (!isRecord(payload) || !Array.isArray(payload['data'])) {
                            throw new Error('The CMS API returned an unexpected response.');
                        }

                        const firstRelease = payload['data'][0];
                        if (firstRelease === undefined) {
                            resolve(null);
                            return;
                        }

                        if (!isRecord(firstRelease) || typeof firstRelease['id'] !== 'string') {
                            throw new Error('The CMS API returned a release without an id.');
                        }

                        resolve({ id: firstRelease['id'] });
                    } catch (error) {
                        reject(error);
                    }
                },
                onerror: () => reject(new Error('The CMS API request failed.')),
                onabort: () => reject(new Error('The CMS API request was aborted.')),
                ontimeout: () => reject(new Error('The CMS API request timed out.')),
            });
        });
    }
}
