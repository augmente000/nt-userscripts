import type { ProgressSnapshot } from './types.ts';

const HOST_ID = 'bcd-host';

type IconName = 'check' | 'collapse' | 'download' | 'lock' | 'retry' | 'stop';

const ICON_PATHS: Record<IconName, string[]> = {
    check: ['m5 12 4 4L19 6'],
    collapse: ['m15 6-6 6 6 6'],
    download: ['M12 3v12m0 0 4-4m-4 4-4-4', 'M4 17v3h16v-3'],
    lock: ['M7 10V7a5 5 0 0 1 10 0v3', 'M5 10h14v10H5z'],
    retry: ['M20 11a8 8 0 1 0-2.34 5.66', 'M20 4v7h-7'],
    stop: ['M4 4h16v16H4z'],
};

function icon(name: IconName): SVGSVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('bcd-icon');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('viewBox', '0 0 24 24');
    for (const data of ICON_PATHS[name]) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', data);
        svg.append(path);
    }
    return svg;
}

function buttonContent(button: HTMLButtonElement, label: string | null, iconName: IconName): void {
    const children: Node[] = [icon(iconName)];
    if (label) {
        children.push(document.createTextNode(label));
    }
    button.replaceChildren(...children);
}

export class ProgressUi {
    private readonly action: HTMLButtonElement;
    private readonly bar: HTMLElement;
    private readonly collapse: HTMLButtonElement;
    private readonly current: HTMLElement;
    private readonly expandedWidth: string;
    private readonly host: HTMLElement;
    private readonly initialLabel: string;
    private readonly notice: HTMLElement;
    private readonly panel: HTMLElement;
    private readonly showDetails: boolean;
    private readonly stop: HTMLButtonElement;
    private readonly summary: HTMLElement;
    private readonly track: HTMLElement;
    private readonly root: HTMLElement;
    private statusIcon: IconName = 'download';

    constructor(label: string, showDetails: boolean, onClick: () => void, onStop: () => void) {
        this.initialLabel = label;
        this.showDetails = showDetails;

        this.expandedWidth = showDetails ? 'min(390px, calc(100vw - 28px))' : 'min(300px, calc(100vw - 28px))';
        this.host = document.createElement('div');
        this.host.id = HOST_ID;
        this.host.style.setProperty('all', 'initial', 'important');
        this.host.style.setProperty('display', 'block', 'important');
        this.host.style.setProperty('position', 'fixed', 'important');
        this.host.style.setProperty('left', '14px', 'important');
        this.host.style.setProperty('bottom', '14px', 'important');
        this.host.style.setProperty('z-index', '2147483647', 'important');
        this.host.style.setProperty('width', this.expandedWidth, 'important');

        const shadow = this.host.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = `
            :host {
                all: initial;
                box-sizing: border-box;
            }

            :where(.bcd-root, .bcd-root section, .bcd-root div, .bcd-root button) {
                all: unset;
                box-sizing: border-box;
            }

            .bcd-root {
                --bcd-surface: #121714;
                --bcd-surface-raised: #1a211d;
                --bcd-border: rgba(166, 244, 200, .3);
                --bcd-text: #edf5f0;
                --bcd-muted: #9eafa6;
                --bcd-accent: #a6f4c8;
                --bcd-accent-strong: #78dda5;
                --bcd-accent-ink: #092519;
                --bcd-danger: #ffb4ac;
                display: block;
                width: 100%;
                border: 1px solid var(--bcd-border);
                border-radius: 14px;
                background:
                    radial-gradient(circle at 15% 0%, rgba(128, 231, 173, .12), transparent 42%),
                    linear-gradient(145deg, #1a211d 0%, var(--bcd-surface) 72%);
                box-shadow:
                    0 18px 42px -18px rgba(0, 0, 0, .82),
                    0 0 0 1px rgba(166, 244, 200, .06),
                    0 0 26px rgba(98, 218, 151, .1);
                color: var(--bcd-text);
                font: 500 12px/1.4 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                padding: 8px;
            }

            .bcd-controls { display: flex; gap: 7px; }
            button {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 7px;
                min-height: 36px;
                border-radius: 9px;
                cursor: pointer;
                font: 750 12px/1 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                text-align: center;
                user-select: none;
                transition:
                    background 150ms ease,
                    border-color 150ms ease,
                    box-shadow 150ms ease,
                    transform 150ms ease;
            }
            .bcd-icon {
                display: block;
                flex: 0 0 auto;
                width: 15px;
                height: 15px;
            }
            .bcd-icon, .bcd-icon * {
                fill: none;
                stroke: currentColor;
                stroke-width: 2;
                stroke-linecap: round;
                stroke-linejoin: round;
            }
            button:focus-visible {
                outline: 2px solid var(--bcd-accent);
                outline-offset: 2px;
            }
            .bcd-action {
                flex: 1;
                border: 1px solid rgba(210, 255, 228, .62);
                background: linear-gradient(135deg, #c9fadd 0%, var(--bcd-accent-strong) 100%);
                box-shadow:
                    inset 0 1px 0 rgba(255, 255, 255, .65),
                    0 5px 16px rgba(74, 213, 135, .2),
                    0 0 18px rgba(111, 231, 163, .12);
                color: var(--bcd-accent-ink);
                padding: 0 13px;
            }
            .bcd-action:hover:not(:disabled) {
                background: linear-gradient(135deg, #dcffe9 0%, #91e7b7 100%);
                box-shadow:
                    inset 0 1px 0 rgba(255, 255, 255, .8),
                    0 7px 20px rgba(74, 213, 135, .28),
                    0 0 24px rgba(111, 231, 163, .18);
                transform: translateY(-1px);
            }
            .bcd-action:active:not(:disabled) { transform: translateY(0); }
            .bcd-action:disabled { cursor: default; opacity: .78; }
            .bcd-action.bcd-unavailable {
                border-color: rgba(248, 218, 156, .48);
                background: linear-gradient(135deg, #f2dcae 0%, #d8b66e 100%);
                box-shadow:
                    inset 0 1px 0 rgba(255, 255, 255, .5),
                    0 4px 16px rgba(215, 174, 93, .14);
                color: #332307;
                opacity: 1;
            }
            .bcd-stop {
                display: none;
                border: 1px solid rgba(255, 146, 136, .38);
                background: linear-gradient(145deg, #38201e, #251716);
                box-shadow: inset 0 1px 0 rgba(255, 255, 255, .05);
                color: var(--bcd-danger);
                padding: 0 11px;
            }
            .bcd-stop[data-visible="true"] { display: flex; }
            .bcd-stop:hover:not(:disabled) {
                border-color: rgba(255, 180, 172, .7);
                box-shadow: 0 0 16px rgba(255, 112, 100, .12);
            }
            .bcd-stop:disabled { cursor: default; opacity: .58; }
            .bcd-stop .bcd-icon * {
                fill: currentColor;
                stroke: none;
            }
            .bcd-collapse {
                flex: 0 0 36px;
                width: 36px;
                border: 1px solid rgba(166, 244, 200, .2);
                background: rgba(255, 255, 255, .035);
                color: #c7d7ce;
            }
            .bcd-collapse:hover {
                border-color: rgba(166, 244, 200, .48);
                background: rgba(166, 244, 200, .08);
                color: var(--bcd-accent);
                box-shadow: 0 0 16px rgba(111, 231, 163, .1);
            }
            .bcd-panel { display: none; padding: 8px 2px 1px; }
            .bcd-panel[data-visible="true"] { display: block; }
            .bcd-summary {
                display: block;
                margin-bottom: 6px;
                color: var(--bcd-text);
                font-weight: 680;
            }
            .bcd-track {
                display: block;
                overflow: hidden;
                height: 5px;
                border: 1px solid rgba(166, 244, 200, .12);
                border-radius: 999px;
                background: #27332d;
                box-shadow: inset 0 1px 3px rgba(0, 0, 0, .46);
            }
            .bcd-track[data-hidden="true"] { display: none; }
            .bcd-bar {
                display: block;
                width: 0;
                height: 100%;
                border-radius: inherit;
                background: linear-gradient(90deg, #65d897, #baf7d3);
                box-shadow: 0 0 10px rgba(111, 231, 163, .7);
                transition: width 200ms cubic-bezier(.25, 1, .5, 1);
            }
            .bcd-current {
                display: block;
                max-height: 3.2em;
                overflow: auto;
                margin-top: 6px;
                color: var(--bcd-muted);
                font-size: 11px;
                white-space: pre-line;
            }
            .bcd-root.bcd-detailed { padding: 10px; }
            .bcd-detailed .bcd-panel { padding-top: 10px; }
            .bcd-detailed .bcd-current {
                height: 8em;
                max-height: none;
                margin-top: 8px;
                padding-right: 4px;
                color: #c8d7cf;
                font-size: 11.5px;
                line-height: 1.5;
                scrollbar-color: rgba(166, 244, 200, .36) transparent;
                scrollbar-width: thin;
            }
            .bcd-notice {
                display: none;
                color: #c9d5ce;
                font-size: 11px;
            }
            .bcd-notice[data-visible="true"] { display: block; }

            .bcd-root[data-collapsed="true"] {
                width: 44px;
                height: 44px;
                overflow: hidden;
                border-radius: 50%;
                padding: 0;
                box-shadow:
                    0 10px 28px -10px rgba(0, 0, 0, .8),
                    0 0 0 1px rgba(166, 244, 200, .12),
                    0 0 22px rgba(98, 218, 151, .14);
            }
            .bcd-root[data-collapsed="true"] .bcd-action,
            .bcd-root[data-collapsed="true"] .bcd-stop,
            .bcd-root[data-collapsed="true"] .bcd-panel { display: none; }
            .bcd-root[data-collapsed="true"] .bcd-controls {
                display: block;
                width: 100%;
                height: 100%;
            }
            .bcd-root[data-collapsed="true"] .bcd-collapse {
                display: flex;
                width: 100%;
                height: 100%;
                min-height: 0;
                border: 0;
                border-radius: 50%;
                background: linear-gradient(135deg, #c9fadd 0%, var(--bcd-accent-strong) 100%);
                box-shadow: inset 0 1px 0 rgba(255, 255, 255, .7);
                color: var(--bcd-accent-ink);
            }
            .bcd-root[data-collapsed="true"] .bcd-collapse .bcd-icon {
                width: 18px;
                height: 18px;
            }
            .bcd-root[data-running="true"][data-collapsed="true"] .bcd-collapse {
                animation: bcd-pulse 1.8s ease-in-out infinite;
            }

            @keyframes bcd-pulse {
                50% { box-shadow: inset 0 1px 0 rgba(255, 255, 255, .7), 0 0 22px rgba(111, 231, 163, .55); }
            }

            @media (prefers-reduced-motion: reduce) {
                button, .bcd-bar { transition: none; }
            }
        `;

        this.root = document.createElement('section');
        this.root.className = showDetails ? 'bcd-root bcd-detailed' : 'bcd-root';
        this.root.dataset['collapsed'] = 'false';
        this.root.dataset['running'] = 'false';
        this.root.setAttribute('aria-label', 'Bandcamp download progress');

        const controls = document.createElement('div');
        controls.className = 'bcd-controls';
        this.action = document.createElement('button');
        this.action.className = 'bcd-action';
        this.action.type = 'button';
        buttonContent(this.action, label, 'download');
        this.action.addEventListener('click', onClick);
        this.stop = document.createElement('button');
        this.stop.className = 'bcd-stop';
        this.stop.type = 'button';
        buttonContent(this.stop, 'Stop', 'stop');
        this.stop.addEventListener('click', () => {
            this.stop.disabled = true;
            buttonContent(this.stop, 'Stopping…', 'stop');
            onStop();
        });
        this.collapse = document.createElement('button');
        this.collapse.className = 'bcd-collapse';
        this.collapse.type = 'button';
        this.collapse.title = 'Collapse downloader';
        this.collapse.setAttribute('aria-label', 'Collapse downloader');
        buttonContent(this.collapse, null, 'collapse');
        this.collapse.addEventListener('click', () => this.setCollapsed(this.root.dataset['collapsed'] !== 'true'));
        controls.append(this.collapse, this.action, this.stop);

        this.panel = document.createElement('div');
        this.panel.className = 'bcd-panel';
        this.summary = document.createElement('div');
        this.summary.className = 'bcd-summary';
        this.track = document.createElement('div');
        this.track.className = 'bcd-track';
        this.track.setAttribute('role', 'progressbar');
        this.track.setAttribute('aria-valuemin', '0');
        this.track.setAttribute('aria-valuemax', '100');
        this.bar = document.createElement('div');
        this.bar.className = 'bcd-bar';
        this.current = document.createElement('div');
        this.current.className = 'bcd-current';
        this.notice = document.createElement('div');
        this.notice.className = 'bcd-notice';

        this.track.append(this.bar);
        if (this.showDetails) {
            this.panel.append(this.summary, this.track, this.current, this.notice);
        } else {
            this.panel.append(this.track, this.notice);
        }
        this.root.append(controls, this.panel);
        shadow.append(style, this.root);
        document.body.append(this.host);
        this.setCollapsed(true);
    }

    private setAction(label: string, iconName: IconName): void {
        this.statusIcon = iconName;
        buttonContent(this.action, label, iconName);
        if (this.root.dataset['collapsed'] === 'true') {
            buttonContent(this.collapse, null, iconName);
        }
    }

    private setCollapsed(collapsed: boolean): void {
        this.root.dataset['collapsed'] = String(collapsed);
        this.host.style.setProperty('width', collapsed ? '44px' : this.expandedWidth, 'important');
        this.collapse.title = collapsed ? 'Expand downloader' : 'Collapse downloader';
        this.collapse.setAttribute('aria-label', collapsed ? 'Expand downloader' : 'Collapse downloader');
        buttonContent(this.collapse, null, collapsed ? this.statusIcon : 'collapse');
    }

    start(total: number): void {
        this.action.disabled = true;
        this.setAction('Downloading…', 'download');
        this.root.dataset['running'] = 'true';
        this.stop.disabled = false;
        buttonContent(this.stop, 'Stop', 'stop');
        this.stop.dataset['visible'] = 'true';
        this.track.dataset['hidden'] = 'false';
        this.notice.dataset['visible'] = 'false';
        this.panel.dataset['visible'] = 'true';
        this.update({
            active: 0,
            completed: 0,
            current: ['Preparing downloads'],
            failed: 0,
            progress: 0,
            queued: total,
            skipped: 0,
            total,
        });
    }

    update(snapshot: ProgressSnapshot): void {
        const percent = Math.min(100, Math.max(0, snapshot.progress * 100));
        this.bar.style.width = `${percent}%`;
        this.track.setAttribute('aria-valuenow', String(Math.round(percent)));
        if (!this.showDetails) {
            return;
        }

        const processed = snapshot.completed + snapshot.skipped + snapshot.failed;
        this.summary.textContent =
            `${processed}/${snapshot.total} · ${snapshot.completed} saved · ` +
            `${snapshot.skipped} skipped · ${snapshot.failed} failed`;
        this.current.textContent = snapshot.current.join('\n') || 'Finishing…';
    }

    finish(snapshot: ProgressSnapshot): void {
        this.update(snapshot);
        this.root.dataset['running'] = 'false';
        this.stop.dataset['visible'] = 'false';
        if (!this.showDetails) {
            this.panel.dataset['visible'] = 'false';
        }
        if (snapshot.failed > 0) {
            this.setAction(
                snapshot.failed === snapshot.total ? 'Failed · Try again' : 'Some failed · Try again',
                'retry',
            );
            this.action.disabled = false;
        } else if (snapshot.total > 0 && snapshot.completed === 0) {
            this.setAction('Nothing downloadable', 'lock');
            this.action.disabled = true;
        } else {
            this.setAction(
                this.initialLabel === 'Download All' ? 'Finished · Download all again' : 'Saved · Download again',
                'check',
            );
            this.action.disabled = false;
        }
        if (this.showDetails) {
            this.current.textContent =
                snapshot.total === 0
                    ? 'No album or track releases were found on this page.'
                    : `${snapshot.completed} saved, ${snapshot.skipped} skipped, ${snapshot.failed} failed.`;
        }
    }

    cancel(snapshot: ProgressSnapshot): void {
        this.update(snapshot);
        this.root.dataset['running'] = 'false';
        this.stop.dataset['visible'] = 'false';
        this.action.disabled = false;
        this.setAction('Stopped · Try again', 'retry');
        if (!this.showDetails) {
            this.panel.dataset['visible'] = 'false';
        }
        if (this.showDetails) {
            this.summary.textContent = 'Stopped';
            this.current.textContent = `${snapshot.completed} saved before stopping.`;
        }
    }

    unavailable(message: string): void {
        this.root.dataset['running'] = 'false';
        this.action.classList.add('bcd-unavailable');
        this.action.disabled = true;
        this.setAction('Purchase required', 'lock');
        this.stop.dataset['visible'] = 'false';
        this.track.dataset['hidden'] = 'true';
        this.notice.textContent = message;
        this.notice.dataset['visible'] = 'true';
        this.panel.dataset['visible'] = 'true';
    }
}

export function progressUiExists(): boolean {
    return document.getElementById(HOST_ID) !== null;
}
