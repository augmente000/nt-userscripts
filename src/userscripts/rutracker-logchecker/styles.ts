const STYLE_ID = 'nt-logchecker-styles';

const CSS = `
.nt-logchecker pre {
    margin: 10px 0;
    padding: 12px;
    overflow: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-family: Consolas, Monaco, "Courier New", monospace;
    line-height: 1.4;
}

.nt-logchecker .good {
    color: #198754;
}

.nt-logchecker .goodish {
    color: #0891b2;
}

.nt-logchecker .badish {
    color: #b7791f;
}

.nt-logchecker .bad {
    color: #dc3545;
}

.nt-logchecker .log1,
.nt-logchecker .log5 {
    text-decoration: underline;
}

.nt-logchecker .log3 {
    color: #2563eb;
}

.nt-logchecker .log4 {
    font-weight: bold;
}

.nt-logchecker-spoiler {
    border-left: 4px solid #2563eb;
}

.nt-logchecker-spoiler > .sp-head {
    background: rgba(37, 99, 235, 0.06);
}

.nt-logchecker-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    align-items: flex-end;
    margin: 10px 0 0;
    border-bottom: 1px solid #b8c4d0;
}

.nt-logchecker-tabs {
    display: flex;
    gap: 4px;
}

.nt-logchecker-tab {
    appearance: none;
    padding: 6px 12px;
    border: 1px solid #b8c4d0;
    border-bottom: 0;
    border-radius: 4px 4px 0 0;
    background: #edf1f5;
    color: inherit;
    cursor: pointer;
    font: inherit;
}

.nt-logchecker-tab:hover,
.nt-logchecker-tab:focus-visible {
    background: #e2e8f0;
}

.nt-logchecker-tab.is-active {
    background: #fff;
    font-weight: bold;
}

a.nt-logchecker-external-link,
a.nt-logchecker-external-link:link,
a.nt-logchecker-external-link:visited {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    margin: 0 0 6px auto;
    padding: 5px 10px;
    color: #fff !important;
    font-weight: bold;
    line-height: 1.2;
    text-decoration: none !important;
    white-space: nowrap;
    background: #1e40af;
    border: 1px solid #1e3a8a;
    border-radius: 4px;
    box-shadow: 0 1px 2px rgb(0 0 0 / 18%);
}

a.nt-logchecker-external-link:hover,
a.nt-logchecker-external-link:focus-visible {
    color: #fff !important;
    text-decoration: none !important;
    background: #1e3a8a;
}

a.nt-logchecker-external-link:focus-visible {
    outline: 2px solid #2563eb;
    outline-offset: 2px;
}

.nt-logchecker-external-icon {
    width: 16px;
    height: 16px;
    border-radius: 2px;
}

.nt-logchecker-panel[hidden] {
    display: none;
}
`;

export function addStyles(): void {
    if (document.getElementById(STYLE_ID)) {
        return;
    }

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head ?? document.documentElement).append(style);
}
