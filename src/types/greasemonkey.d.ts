/// <reference types="greasemonkey" />

declare const unsafeWindow: Window;

declare function GM_openInTab(
    url: string,
    options?: {
        active?: boolean;
        insert?: boolean;
        setParent?: boolean;
        incognito?: boolean;
    },
): unknown;
