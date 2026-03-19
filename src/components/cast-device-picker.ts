import type { PluginListenerHandle } from '@capacitor/core';

import type { CastDevice, CastPlugin, DiscoveredDevicesResult } from '../definitions';

/**
 * CastDevicePicker — Custom Element
 *
 * Replaces the native device picker with a fully styleable component.
 * Handles device discovery, permission checks, scanning state and
 * guides the user to Settings when permissions are permanently denied.
 *
 * @example
 * ```html
 * <cast-device-picker></cast-device-picker>
 * ```
 *
 * CSS custom properties:
 *   --cast-picker-bg          Container background (default: #fff)
 *   --cast-picker-color       Text colour (default: #1a1a1a)
 *   --cast-picker-accent      Accent / spinner colour (default: #1a73e8)
 *   --cast-picker-radius      Container border-radius (default: 12px)
 *   --cast-picker-device-bg   Device row background (default: transparent)
 *   --cast-picker-device-hover Device row hover background (default: #f5f5f5)
 *   --cast-picker-font        Font family (default: inherit)
 *   --cast-picker-width       Container width (default: 320px)
 *
 * Observed attributes:
 *   title-label     — header text  (default: "Cast to")
 *   scanning-label  — shown while scanning (default: "Scanning…")
 *   empty-label     — shown when no devices found (default: "No devices found")
 *
 * Dispatched DOM events (bubbles, composed):
 *   cast-device-select      — detail: { device: CastDevice }
 *   cast-permission-denied  — no detail; permissions permanently refused
 *   cast-error              — detail: { code: string; message: string }
 *
 * Public methods:
 *   refresh() — force re-scan
 */
export class CastDevicePicker extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['title-label', 'scanning-label', 'empty-label'];
  }

  // ─── Internal state ────────────────────────────────────────────────────────

  private cast: CastPlugin | null = null;
  private listeners: PluginListenerHandle[] = [];
  private devices: CastDevice[] = [];
  private scanning = false;
  private permissionState: 'unknown' | 'granted' | 'prompt' | 'denied' = 'unknown';
  private connectedDeviceId: string | null = null;
  private webFallback = false; // true when Cast SDK has no device-list API

  // ─── Custom Element lifecycle ──────────────────────────────────────────────

  connectedCallback(): void {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
    }
    this.render();
    void this.setup();
  }

  disconnectedCallback(): void {
    this.teardown();
  }

  attributeChangedCallback(): void {
    this.render();
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /** Force a new discovery scan. */
  async refresh(): Promise<void> {
    if (!this.cast) return;
    this.scanning = true;
    this.render();
    try {
      const result =
        typeof this.cast.rescanDevices === 'function'
          ? await this.cast.rescanDevices()
          : await this.cast.getDiscoveredDevices();
      this.applyDevices(result);
    } catch {
      // best-effort
    } finally {
      this.scanning = false;
      this.render();
    }
  }

  // ─── Setup / teardown ──────────────────────────────────────────────────────

  private async setup(): Promise<void> {
    this.cast = this.resolveCastPlugin();
    if (!this.cast) {
      this.emitError('NOT_INITIALIZED', 'Cast plugin not found. Call initialize() first.');
      return;
    }

    await this.checkPermissions();
    if (this.permissionState === 'denied') return;

    await this.loadDevices();
    await this.attachListeners();
  }

  private teardown(): void {
    for (const handle of this.listeners) {
      handle.remove().catch(() => undefined);
    }
    this.listeners = [];
  }

  private resolveCastPlugin(): CastPlugin | null {
    // Works with Capacitor 5+/6+ regardless of how the plugin is registered.
    const cap = (globalThis as Record<string, unknown>)['Capacitor'] as
      | { Plugins?: Record<string, unknown> }
      | undefined;
    return (cap?.Plugins?.['Cast'] as CastPlugin) ?? null;
  }

  // ─── Permissions ───────────────────────────────────────────────────────────

  private async checkPermissions(): Promise<void> {
    if (!this.cast) return;
    try {
      const status = await this.cast.checkPermissions();
      this.permissionState = status.localNetwork as typeof this.permissionState;
    } catch {
      this.permissionState = 'granted'; // non-iOS platform — no permission needed
    }
    this.render();
  }

  private async requestPermissions(): Promise<void> {
    if (!this.cast) return;
    try {
      const status = await this.cast.requestPermissions();
      this.permissionState = status.localNetwork as typeof this.permissionState;
      if (this.permissionState === 'granted') {
        await this.loadDevices();
        await this.attachListeners();
      } else if (this.permissionState === 'denied') {
        this.emitEvent('cast-permission-denied', undefined);
      }
    } catch {
      // best-effort
    }
    this.render();
  }

  private async openSettings(): Promise<void> {
    await this.cast?.openSettings();
  }

  // ─── Device loading ────────────────────────────────────────────────────────

  private async loadDevices(): Promise<void> {
    if (!this.cast) return;
    this.scanning = true;
    this.render();
    try {
      const result = await this.cast.getDiscoveredDevices();
      this.applyDevices(result);
      // On web, Cast SDK never returns a real list — switch to fallback UI.
      this.webFallback = result.devices.length === 0 && this.isWebPlatform();
    } catch {
      this.webFallback = this.isWebPlatform();
    } finally {
      this.scanning = false;
      this.render();
    }
  }

  private applyDevices(result: DiscoveredDevicesResult): void {
    this.devices = result.devices ?? [];
    this.connectedDeviceId = this.devices.find((d) => d.isConnected)?.deviceId ?? null;
  }

  private isWebPlatform(): boolean {
    const cap = (globalThis as Record<string, unknown>)['Capacitor'] as { getPlatform?: () => string } | undefined;
    return !cap?.getPlatform || cap.getPlatform() === 'web';
  }

  // ─── Listeners ─────────────────────────────────────────────────────────────

  private async attachListeners(): Promise<void> {
    if (!this.cast) return;

    const devicesHandle = await this.cast.addListener('devicesChanged', (result) => {
      this.applyDevices(result);
      this.render();
    });

    const sessionHandle = await this.cast.addListener('sessionStateChanged', (event) => {
      const session = event.session;
      if (session && typeof session === 'object' && 'receiverFriendlyName' in session) {
        // Mark the connected device
        const deviceId = (session as Record<string, unknown>)['deviceId'] as string | undefined;
        this.connectedDeviceId = deviceId ?? null;
      } else {
        this.connectedDeviceId = null;
      }
      // Refresh device list to reflect connected state
      void this.refresh();
    });

    this.listeners.push(devicesHandle, sessionHandle);
  }

  // ─── Device selection ──────────────────────────────────────────────────────

  private async selectDevice(device: CastDevice): Promise<void> {
    if (!this.cast) return;
    this.emitEvent('cast-device-select', { device });
    try {
      if (typeof this.cast.connectToDevice === 'function') {
        await this.cast.connectToDevice({ deviceId: device.deviceId });
      } else {
        await this.cast.requestSession();
      }
    } catch (err) {
      const e = err as { code?: string; message?: string };
      this.emitError(e.code ?? 'OPERATION_FAILED', e.message ?? 'Failed to connect');
    }
  }

  private async connectWeb(): Promise<void> {
    if (!this.cast) return;
    try {
      await this.cast.requestSession();
    } catch (err) {
      const e = err as { code?: string; message?: string };
      this.emitError(e.code ?? 'OPERATION_FAILED', e.message ?? 'Failed to connect');
    }
  }

  // ─── Events ────────────────────────────────────────────────────────────────

  private emitEvent(name: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  private emitError(code: string, message: string): void {
    this.emitEvent('cast-error', { code, message });
  }

  // ─── Rendering ─────────────────────────────────────────────────────────────

  private get titleLabel(): string {
    return this.getAttribute('title-label') ?? 'Cast to';
  }

  private get scanningLabel(): string {
    return this.getAttribute('scanning-label') ?? 'Scanning…';
  }

  private get emptyLabel(): string {
    return this.getAttribute('empty-label') ?? 'No devices found';
  }

  private render(): void {
    const root = this.shadowRoot;
    if (!root) return;
    root.innerHTML = this.buildHTML();
    this.attachDomListeners(root);
  }

  private buildHTML(): string {
    return `
      <style>
        :host {
          display: block;
          font-family: var(--cast-picker-font, inherit);
          width: var(--cast-picker-width, 320px);
        }
        .container {
          background: var(--cast-picker-bg, #fff);
          color: var(--cast-picker-color, #1a1a1a);
          border-radius: var(--cast-picker-radius, 12px);
          overflow: hidden;
          box-shadow: 0 2px 12px rgba(0,0,0,.12);
        }
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px 10px;
          border-bottom: 1px solid rgba(0,0,0,.07);
        }
        .title {
          font-size: .9rem;
          font-weight: 600;
          opacity: .7;
          text-transform: uppercase;
          letter-spacing: .06em;
        }
        .refresh-btn {
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px;
          color: var(--cast-picker-accent, #1a73e8);
          display: flex;
          align-items: center;
          border-radius: 50%;
          transition: background .15s;
        }
        .refresh-btn:hover { background: rgba(0,0,0,.06); }
        .refresh-btn svg { width: 18px; height: 18px; }
        .spinning { animation: spin .9s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .body { padding: 8px 0; min-height: 56px; }
        .status {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          font-size: .875rem;
          opacity: .6;
        }
        .spinner {
          width: 16px; height: 16px;
          border: 2px solid currentColor;
          border-top-color: var(--cast-picker-accent, #1a73e8);
          border-radius: 50%;
          animation: spin .9s linear infinite;
          flex-shrink: 0;
        }
        .device-list { list-style: none; margin: 0; padding: 0; }
        .device-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 16px;
          cursor: pointer;
          background: var(--cast-picker-device-bg, transparent);
          transition: background .12s;
          font-size: .9rem;
        }
        .device-item:hover { background: var(--cast-picker-device-hover, #f5f5f5); }
        .device-item.connected { font-weight: 600; }
        .device-icon { flex-shrink: 0; opacity: .55; }
        .device-icon svg { width: 20px; height: 20px; display: block; }
        .device-info { flex: 1; min-width: 0; }
        .device-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .device-model { font-size: .78rem; opacity: .5; margin-top: 1px; }
        .connected-badge {
          font-size: .72rem;
          background: var(--cast-picker-accent, #1a73e8);
          color: #fff;
          padding: 2px 7px;
          border-radius: 9px;
          flex-shrink: 0;
        }
        .permission-box {
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          font-size: .875rem;
        }
        .permission-box p { margin: 0; opacity: .7; line-height: 1.4; }
        .action-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 8px 16px;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          font-size: .875rem;
          font-weight: 500;
          background: var(--cast-picker-accent, #1a73e8);
          color: #fff;
          transition: opacity .15s;
          width: 100%;
        }
        .action-btn:hover { opacity: .88; }
        .action-btn.secondary {
          background: transparent;
          color: var(--cast-picker-accent, #1a73e8);
          border: 1px solid currentColor;
        }
        .cast-web-btn {
          padding: 10px 16px 16px;
        }
      </style>
      <div class="container" part="container">
        ${this.renderHeader()}
        <div class="body" part="body">
          ${this.renderBody()}
        </div>
      </div>
    `;
  }

  private renderHeader(): string {
    const spinning = this.scanning;
    return `
      <div class="header" part="header">
        <span class="title" part="title">${this.esc(this.titleLabel)}</span>
        <button class="refresh-btn" part="refresh-btn" data-action="refresh" aria-label="Refresh">
          <svg class="${spinning ? 'spinning' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/>
          </svg>
        </button>
      </div>
    `;
  }

  private renderBody(): string {
    if (this.permissionState === 'prompt' || this.permissionState === 'unknown') {
      // Show permission request prompt only on native (iOS)
      if (!this.isWebPlatform() && this.permissionState === 'prompt') {
        return `
          <div class="permission-box" part="permission-box">
            <p>Local network access is required to find Cast devices.</p>
            <button class="action-btn" data-action="request-permissions">Enable Access</button>
          </div>
        `;
      }
    }

    if (this.permissionState === 'denied') {
      return `
        <div class="permission-box" part="permission-box">
          <p>Local network access was denied. Open Settings to allow it.</p>
          <button class="action-btn" data-action="open-settings">Open Settings</button>
        </div>
      `;
    }

    if (this.scanning) {
      return `<div class="status" part="status"><div class="spinner"></div>${this.esc(this.scanningLabel)}</div>`;
    }

    if (this.webFallback) {
      return `
        <div class="cast-web-btn" part="cast-web-btn">
          <button class="action-btn" data-action="connect-web">
            ${castIcon()} Cast
          </button>
        </div>
      `;
    }

    if (this.devices.length === 0) {
      return `<div class="status" part="status">${this.esc(this.emptyLabel)}</div>`;
    }

    const items = this.devices
      .map((d) => {
        const connected = d.deviceId === this.connectedDeviceId || d.isConnected;
        return `
          <li class="device-item${connected ? ' connected' : ''}" part="device-item" data-action="select-device" data-device-id="${this.esc(d.deviceId)}">
            <span class="device-icon">${tvIcon()}</span>
            <span class="device-info">
              <div class="device-name">${this.esc(d.friendlyName)}</div>
              ${d.modelName ? `<div class="device-model">${this.esc(d.modelName)}</div>` : ''}
            </span>
            ${connected ? '<span class="connected-badge">Connected</span>' : ''}
          </li>
        `;
      })
      .join('');

    return `<ul class="device-list" part="device-list">${items}</ul>`;
  }

  private attachDomListeners(root: ShadowRoot): void {
    root.addEventListener('click', (e) => {
      const target = (e.target as Element).closest('[data-action]') as HTMLElement | null;
      if (!target) return;
      const action = target.dataset['action'];
      if (action === 'refresh') {
        void this.refresh();
      } else if (action === 'request-permissions') {
        void this.requestPermissions();
      } else if (action === 'open-settings') {
        void this.openSettings();
      } else if (action === 'connect-web') {
        void this.connectWeb();
      } else if (action === 'select-device') {
        const deviceId = target.dataset['deviceId'];
        const device = this.devices.find((d) => d.deviceId === deviceId);
        if (device) void this.selectDevice(device);
      }
    });
  }

  private esc(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

// ─── SVG helpers ──────────────────────────────────────────────────────────────

function tvIcon(): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2"/><polyline points="8 21 12 17 16 21"/><line x1="12" y1="17" x2="12" y2="21"/>
  </svg>`;
}

function castIcon(): string {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"/><line x1="2" y1="20" x2="2.01" y2="20"/>
  </svg>`;
}

if (typeof customElements !== 'undefined' && !customElements.get('cast-device-picker')) {
  customElements.define('cast-device-picker', CastDevicePicker);
}
