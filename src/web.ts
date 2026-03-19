import { WebPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

import type {
  CastCapabilities,
  CastErrorCode,
  CastErrorEvent,
  CastMediaStatusSnapshot,
  DiscoveredDevicesResult,
  CastStateResult,
  CastStateSnapshot,
  MediaStatusResult,
  CastPermissionStatus,
  CastPlugin,
  CastSessionSnapshot,
  SessionResult,
  CastUiMode,
  EndSessionOptions,
  InitializeResult,
  IsInitializedResult,
  LoadMediaRequest,
  LoadMediaResult,
  MessageReceivedEvent,
  NamespaceOptions,
  SessionStateChangedEvent,
  SeekOptions,
  SendMessageOptions,
  SetMutedOptions,
  SetVolumeOptions,
} from './definitions';

type CastPluginError = Error & {
  code: CastErrorCode;
  data?: Record<string, unknown>;
};

interface CastSenderGlobal {
  cast?: {
    framework?: Record<string, unknown>;
  };
  chrome?: {
    cast?: Record<string, unknown>;
  };
  Capacitor?: {
    config?: {
      plugins?: Record<string, unknown>;
    };
  };
  __onGCastApiAvailable?: (isAvailable: boolean) => void;
  document?: Document;
}

interface CastConfig {
  receiverApplicationId: string;
  uiMode: CastUiMode;
  autoJoinPolicy: string;
}

const CAST_SENDER_SCRIPT = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
const DEFAULT_RECEIVER_APPLICATION_ID = 'CC1AD845';
const AUTO_INIT_CONFIG_WAIT_MS = 3000;
const AUTO_INIT_CONFIG_POLL_MS = 100;
const VALID_UI_MODES: CastUiMode[] = ['picker', 'nativeButton', 'headless'];
const VALID_ERROR_CODES: CastErrorCode[] = [
  'UNSUPPORTED_PLATFORM',
  'NOT_INITIALIZED',
  'NO_ACTIVE_SESSION',
  'INVALID_ARGUMENT',
  'UI_MODE_NOT_AVAILABLE',
  'OPERATION_FAILED',
];

export class CastWeb extends WebPlugin implements CastPlugin {
  private initialized = false;
  private isSupported = false;
  private uiMode: CastUiMode = 'picker';
  private receiverApplicationId = '';
  private autoJoinPolicy = 'origin_scoped';
  private senderScriptPromise: Promise<void> | null = null;
  private initializePromise: Promise<InitializeResult> | null = null;
  private autoInitializeTriggered = false;

  private castContextListenersAttached = false;
  private castStateSnapshot: CastStateSnapshot = null;
  private remotePlayer: Record<string, unknown> | null = null;
  private remotePlayerController: Record<string, unknown> | null = null;
  private remotePlayerListenerAttached = false;
  private remotePlayerSnapshot: CastMediaStatusSnapshot | null = null;

  private readonly subscribedMessageNamespaces = new Set<string>();
  private readonly attachedMessageNamespaces = new Set<string>();
  private attachedMessageSession: Record<string, unknown> | null = null;

  private readonly sessionMessageListener = (...args: unknown[]): void => {
    const namespace = this.asString(args[0]);
    if (!namespace) {
      return;
    }

    const payload = args.length > 1 ? args[1] : undefined;
    this.emitMessageReceived(namespace, payload);
  };

  constructor() {
    super();
    this.triggerAutoInitialize();
  }

  addListener(eventName: 'castError', listenerFunc: (event: CastErrorEvent) => void): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'messageReceived',
    listenerFunc: (event: MessageReceivedEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'sessionStateChanged',
    listenerFunc: (event: SessionStateChangedEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'devicesChanged',
    listenerFunc: (result: DiscoveredDevicesResult) => void,
  ): Promise<PluginListenerHandle>;
  addListener(eventName: string, listenerFunc: (...args: any[]) => void): Promise<PluginListenerHandle> {
    return super.addListener(eventName, listenerFunc);
  }

  async removeAllListeners(): Promise<void> {
    await super.removeAllListeners();
  }

  async isInitialized(): Promise<IsInitializedResult> {
    return { isInitialized: this.initialized };
  }

  async checkPermissions(): Promise<CastPermissionStatus> {
    return { localNetwork: 'granted' };
  }

  async requestPermissions(): Promise<CastPermissionStatus> {
    return this.checkPermissions();
  }

  async initialize(): Promise<InitializeResult> {
    if (this.initializePromise) {
      return this.initializePromise;
    }

    this.initializePromise = this.doInitialize();

    try {
      return await this.initializePromise;
    } finally {
      this.initializePromise = null;
    }
  }

  private async doInitialize(): Promise<InitializeResult> {
    const config = this.readConfig();

    this.receiverApplicationId = config.receiverApplicationId;
    this.uiMode = config.uiMode;
    this.autoJoinPolicy = config.autoJoinPolicy;

    this.isSupported = await this.ensureCastApiAvailable();
    this.initialized = true;
    this.castStateSnapshot = null;
    this.remotePlayer = null;
    this.remotePlayerController = null;
    this.remotePlayerListenerAttached = false;
    this.remotePlayerSnapshot = null;

    if (this.isSupported) {
      this.configureCastContext();
      this.setupRemotePlayer();
      this.attachCastContextListeners();
      this.castStateSnapshot = this.buildCastStateSnapshotFromContext();
      this.syncMessageListeners(this.getCurrentCastSession());
    }

    return {
      isSupported: this.isSupported,
      uiMode: this.uiMode,
      receiverApplicationId: this.receiverApplicationId,
    };
  }

  private triggerAutoInitialize(): void {
    if (this.autoInitializeTriggered) {
      return;
    }
    this.autoInitializeTriggered = true;

    void (async () => {
      const hasCastConfig = await this.waitForConfigHydration();
      if (!hasCastConfig) {
        return;
      }

      const plugins = this.readCapacitorPlugins();
      const castConfig = plugins.Cast ?? plugins.cast;
      if (this.isPlainRecord(castConfig) && castConfig.autoInitialize === false) {
        return;
      }

      await this.initialize();
    })().catch(() => {
      // Automatic initialization is best-effort; explicit initialize() remains available.
    });
  }

  private async waitForConfigHydration(): Promise<boolean> {
    if (this.hasCastConfigInCapacitor()) {
      return true;
    }

    const startedAt = Date.now();
    while (Date.now() - startedAt < AUTO_INIT_CONFIG_WAIT_MS) {
      await new Promise<void>((resolve) => globalThis.setTimeout(resolve, AUTO_INIT_CONFIG_POLL_MS));
      if (this.hasCastConfigInCapacitor()) {
        return true;
      }
    }

    return false;
  }

  private hasCastConfigInCapacitor(): boolean {
    const plugins = this.win.Capacitor?.config?.plugins;
    if (!plugins || typeof plugins !== 'object') {
      return false;
    }

    const castConfig = plugins['Cast'];
    return castConfig != null && typeof castConfig === 'object';
  }

  async getCapabilities(): Promise<CastCapabilities> {
    this.ensureInitialized('getCapabilities');

    return {
      isSupported: this.isSupported,
      canRequestSession: this.isSupported,
      canShowDevicePicker: this.isSupported && this.uiMode === 'picker',
      supportsMediaControl: this.isSupported,
      supportsVolumeControl: this.isSupported,
      supportsCustomChannels: this.hasCustomChannelSupport(),
    };
  }

  async getCastState(): Promise<CastStateResult> {
    this.ensureInitialized('getCastState');

    if (!this.isSupported) {
      return { castState: null };
    }

    if (this.castStateSnapshot) {
      return { castState: this.castStateSnapshot };
    }

    return { castState: this.buildCastStateSnapshotFromContext() };
  }

  async getSession(): Promise<SessionResult> {
    this.ensureInitialized('getSession');

    if (!this.isSupported) {
      return { session: null };
    }

    const session = this.getCurrentCastSession();
    return { session: this.snapshotCastSession(session) };
  }

  async requestSession(): Promise<void> {
    this.ensureInitialized('requestSession');
    this.ensureSupported('requestSession');

    if (this.uiMode === 'nativeButton') {
      this.throwPluginError(
        'requestSession',
        'UI_MODE_NOT_AVAILABLE',
        'requestSession is unavailable when uiMode is nativeButton',
      );
    }

    if (this.uiMode === 'headless') {
      this.throwPluginError(
        'requestSession',
        'UI_MODE_NOT_AVAILABLE',
        'requestSession cannot open picker when uiMode is headless',
      );
    }

    try {
      const context = this.getCastContext();
      if (!context) {
        this.throwPluginError(
          'requestSession',
          'UNSUPPORTED_PLATFORM',
          'Google Cast context is unavailable on this browser',
        );
      }

      await this.invokeSessionRequestMethod(context, 'requestSession', []);
      this.syncMessageListeners(this.getCurrentCastSession());
    } catch (error) {
      throw this.handleCaughtError('requestSession', error);
    }
  }

  async showDevicePicker(): Promise<void> {
    this.ensureInitialized('showDevicePicker');
    this.ensureSupported('showDevicePicker');

    if (this.uiMode !== 'picker') {
      this.throwPluginError(
        'showDevicePicker',
        'UI_MODE_NOT_AVAILABLE',
        `showDevicePicker is unavailable when uiMode is ${this.uiMode}`,
      );
    }

    try {
      await this.requestSession();
    } catch (error) {
      throw this.handleCaughtError('showDevicePicker', error);
    }
  }

  async endSession(options?: EndSessionOptions): Promise<void> {
    this.ensureInitialized('endSession');
    this.ensureSupported('endSession');

    try {
      const context = this.getCastContext();
      if (!context) {
        this.throwPluginError(
          'endSession',
          'UNSUPPORTED_PLATFORM',
          'Google Cast context is unavailable on this browser',
        );
      }

      const stopCasting = options?.stopCasting ?? true;
      await this.invokeCastMethod(context, 'endCurrentSession', [stopCasting]);
      this.syncMessageListeners(this.getCurrentCastSession());
    } catch (error) {
      throw this.handleCaughtError('endSession', error);
    }
  }

  async loadMedia(request: LoadMediaRequest): Promise<LoadMediaResult> {
    this.ensureInitialized('loadMedia');
    this.ensureSupported('loadMedia');

    if (!request.url || !request.contentType) {
      this.throwPluginError('loadMedia', 'INVALID_ARGUMENT', 'loadMedia requires url and contentType');
    }

    try {
      const session = this.getCurrentCastSession();
      if (!session) {
        this.throwPluginError('loadMedia', 'NO_ACTIVE_SESSION', 'No active cast session');
      }

      const mediaNamespace = this.getChromeCastMediaNamespace();
      const mediaInfo = this.createMediaInfo(mediaNamespace, request);
      const loadRequest = this.createLoadRequest(mediaNamespace, mediaInfo, request);

      const loadResult = await this.invokeCastMethod(session, 'loadMedia', [loadRequest]);

      const requestId = this.extractRequestId(loadResult);
      return { requestId };
    } catch (error) {
      throw this.handleCaughtError('loadMedia', error);
    }
  }

  async play(): Promise<void> {
    await this.controlMedia('play', 'play', []);
  }

  async pause(): Promise<void> {
    await this.controlMedia('pause', 'pause', []);
  }

  async stop(): Promise<void> {
    await this.controlMedia('stop', 'stop', []);
  }

  async seek(options: SeekOptions): Promise<void> {
    this.ensureInitialized('seek');
    this.ensureSupported('seek');

    if (!Number.isFinite(options.position) || options.position < 0) {
      this.throwPluginError('seek', 'INVALID_ARGUMENT', 'seek position must be a number >= 0');
    }

    try {
      const mediaSession = this.getActiveMediaSession();
      const mediaNamespace = this.getChromeCastMediaNamespace();
      const seekRequest = this.createSeekRequest(mediaNamespace, options.position);
      await this.invokeCastMethod(mediaSession, 'seek', [seekRequest]);
    } catch (error) {
      throw this.handleCaughtError('seek', error);
    }
  }

  async setVolume(options: SetVolumeOptions): Promise<void> {
    this.ensureInitialized('setVolume');
    this.ensureSupported('setVolume');

    if (!Number.isFinite(options.level) || options.level < 0 || options.level > 1) {
      this.throwPluginError('setVolume', 'INVALID_ARGUMENT', 'setVolume level must be in range [0, 1]');
    }

    try {
      const session = this.getCurrentCastSession();
      if (!session) {
        this.throwPluginError('setVolume', 'NO_ACTIVE_SESSION', 'No active cast session');
      }

      await this.invokeCastMethod(session, 'setVolume', [options.level]);
    } catch (error) {
      throw this.handleCaughtError('setVolume', error);
    }
  }

  async setMuted(options: SetMutedOptions): Promise<void> {
    this.ensureInitialized('setMuted');
    this.ensureSupported('setMuted');

    try {
      const session = this.getCurrentCastSession();
      if (!session) {
        this.throwPluginError('setMuted', 'NO_ACTIVE_SESSION', 'No active cast session');
      }

      await this.invokeCastMethod(session, 'setMute', [options.muted]);
    } catch (error) {
      throw this.handleCaughtError('setMuted', error);
    }
  }

  async getMediaStatus(): Promise<MediaStatusResult> {
    this.ensureInitialized('getMediaStatus');

    if (!this.isSupported) {
      return { mediaStatus: null };
    }

    const snapshot = this.remotePlayerSnapshot ?? this.snapshotRemotePlayer();
    if (!snapshot) {
      return { mediaStatus: null };
    }

    this.remotePlayerSnapshot = snapshot;
    return { mediaStatus: snapshot };
  }

  async getDiscoveredDevices(): Promise<DiscoveredDevicesResult> {
    this.ensureInitialized('getDiscoveredDevices');

    if (!this.isSupported) {
      return { devices: [] };
    }

    // The Cast Sender SDK does not expose a device list on web.
    // Return the currently connected device if any, so callers have something to work with.
    const session = this.getCurrentCastSession();
    if (!session) {
      return { devices: [] };
    }

    const getCastDevice = session['getCastDevice'];
    const castDevice =
      typeof getCastDevice === 'function'
        ? this.isPlainRecord(getCastDevice.call(session))
          ? (getCastDevice.call(session) as Record<string, unknown>)
          : null
        : null;

    const deviceId = this.asString(castDevice?.['deviceId']) ?? 'web-cast-device';
    const friendlyName = this.asString(castDevice?.['friendlyName']) ?? 'Cast Device';

    return {
      devices: [{ deviceId, friendlyName, isConnected: true }],
    };
  }

  async openSettings(): Promise<void> {
    // No-op on web — there are no app-level settings to open.
  }

  async sendMessage(options: SendMessageOptions): Promise<void> {
    this.ensureInitialized('sendMessage');
    this.ensureSupported('sendMessage');

    const namespace = this.normalizeNamespace(options?.namespace);
    if (!namespace) {
      this.throwPluginError('sendMessage', 'INVALID_ARGUMENT', 'sendMessage requires a non-empty namespace');
    }

    const message = this.normalizeOutgoingMessage(options?.message);

    try {
      const session = this.getCurrentCastSession();
      if (!session) {
        this.throwPluginError('sendMessage', 'NO_ACTIVE_SESSION', 'No active cast session');
      }

      await this.invokeCastMethod(session, 'sendMessage', [namespace, message]);
    } catch (error) {
      throw this.handleCaughtError('sendMessage', error);
    }
  }

  async subscribeNamespace(options: NamespaceOptions): Promise<void> {
    this.ensureInitialized('subscribeNamespace');
    this.ensureSupported('subscribeNamespace');

    const namespace = this.normalizeNamespace(options?.namespace);
    if (!namespace) {
      this.throwPluginError(
        'subscribeNamespace',
        'INVALID_ARGUMENT',
        'subscribeNamespace requires a non-empty namespace',
      );
    }

    this.subscribedMessageNamespaces.add(namespace);
    this.syncMessageListeners(this.getCurrentCastSession());
  }

  async unsubscribeNamespace(options: NamespaceOptions): Promise<void> {
    this.ensureInitialized('unsubscribeNamespace');

    const namespace = this.normalizeNamespace(options?.namespace);
    if (!namespace) {
      this.throwPluginError(
        'unsubscribeNamespace',
        'INVALID_ARGUMENT',
        'unsubscribeNamespace requires a non-empty namespace',
      );
    }

    this.subscribedMessageNamespaces.delete(namespace);

    const session = this.attachedMessageSession;
    if (!session || !this.attachedMessageNamespaces.has(namespace)) {
      return;
    }

    const removeMessageListener = session.removeMessageListener;
    if (typeof removeMessageListener !== 'function') {
      this.attachedMessageNamespaces.delete(namespace);
      return;
    }

    try {
      removeMessageListener.call(session, namespace, this.sessionMessageListener);
    } catch {
      // Best effort cleanup.
    }
    this.attachedMessageNamespaces.delete(namespace);
  }

  private async controlMedia(method: string, mediaMethod: string, args: unknown[]): Promise<void> {
    this.ensureInitialized(method);
    this.ensureSupported(method);

    try {
      const mediaSession = this.getActiveMediaSession();
      await this.invokeCastMethod(mediaSession, mediaMethod, args);
    } catch (error) {
      throw this.handleCaughtError(method, error);
    }
  }

  private readConfig(): CastConfig {
    const plugins = this.readCapacitorPlugins();
    const fromCast = plugins.Cast;
    const fromCastLowercase = plugins.cast;

    const config = this.isPlainRecord(fromCast)
      ? fromCast
      : this.isPlainRecord(fromCastLowercase)
        ? fromCastLowercase
        : {};

    const rawReceiverApplicationId = config.receiverApplicationId ?? config.receiverAppId;
    const receiverApplicationIdRaw =
      typeof rawReceiverApplicationId === 'string' ? rawReceiverApplicationId.trim() : '';
    const receiverApplicationId = receiverApplicationIdRaw || DEFAULT_RECEIVER_APPLICATION_ID;

    const rawUiMode = config.uiMode;
    const uiMode = typeof rawUiMode === 'string' && this.isValidUiMode(rawUiMode) ? rawUiMode : 'picker';

    const rawAutoJoinPolicy = config.autoJoinPolicy;
    const autoJoinPolicy =
      typeof rawAutoJoinPolicy === 'string' && rawAutoJoinPolicy.trim().length > 0
        ? rawAutoJoinPolicy.trim().toLowerCase()
        : 'origin_scoped';

    return {
      receiverApplicationId,
      uiMode,
      autoJoinPolicy,
    };
  }

  private readCapacitorPlugins(): Record<string, unknown> {
    const rawConfig = this.win.Capacitor?.config;
    if (!this.isPlainRecord(rawConfig)) {
      return {};
    }

    const rawPlugins = rawConfig.plugins;
    return this.isPlainRecord(rawPlugins) ? rawPlugins : {};
  }

  private ensureInitialized(method: string): void {
    if (!this.initialized) {
      this.throwPluginError(method, 'NOT_INITIALIZED', 'Call initialize() before using cast APIs');
    }
  }

  private ensureSupported(method: string): void {
    if (!this.isSupported) {
      this.throwPluginError(method, 'UNSUPPORTED_PLATFORM', 'Google Cast is unavailable in the current runtime');
    }
  }

  private async ensureCastApiAvailable(): Promise<boolean> {
    if (this.hasCastFramework()) {
      return true;
    }

    const win = this.win;
    if (!win.document) {
      return false;
    }

    if (!this.senderScriptPromise) {
      this.senderScriptPromise = this.loadCastSenderScript(win);
    }

    try {
      await this.senderScriptPromise;
      return this.hasCastFramework();
    } catch {
      return false;
    } finally {
      this.senderScriptPromise = null;
    }
  }

  private loadCastSenderScript(win: CastSenderGlobal): Promise<void> {
    return new Promise((resolve, reject) => {
      const doc = win.document;
      if (!doc) {
        resolve();
        return;
      }

      const script =
        (doc.querySelector(`script[src="${CAST_SENDER_SCRIPT}"]`) as HTMLScriptElement | null) ??
        doc.createElement('script');
      if (!script) {
        resolve();
        return;
      }

      let settled = false;
      const previousHandler = win.__onGCastApiAvailable;

      const finish = (callback: () => void): void => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        callback();
      };

      const onLoad = (): void => {
        // Cast sender bootstrap may fire `load` before the framework is fully
        // attached to `window.cast/framework`. The official readiness signal
        // is `__onGCastApiAvailable`.
      };

      const onError = (): void => {
        finish(() => reject(new Error('Unable to load Google Cast sender script')));
      };

      const cleanup = (): void => {
        globalThis.clearTimeout(timeout);
        script.removeEventListener('load', onLoad);
        script.removeEventListener('error', onError);

        if (win.__onGCastApiAvailable === onGCastApiAvailable) {
          win.__onGCastApiAvailable = previousHandler;
        }
      };

      const onGCastApiAvailable = (isAvailable: boolean): void => {
        if (typeof previousHandler === 'function') {
          previousHandler(isAvailable);
        }
        if (isAvailable) {
          finish(resolve);
          return;
        }

        finish(() => reject(new Error('Google Cast sender API is unavailable')));
      };

      const timeout = globalThis.setTimeout(() => {
        finish(resolve);
      }, 10000);

      win.__onGCastApiAvailable = onGCastApiAvailable;

      script.addEventListener('load', onLoad, { once: true });
      script.addEventListener('error', onError, { once: true });

      if (!script.src) {
        script.src = CAST_SENDER_SCRIPT;
      }
      script.async = true;

      if (!script.parentNode) {
        doc.head.appendChild(script);
      }
    });
  }

  private hasCastFramework(): boolean {
    const framework = this.win.cast?.framework;
    const chromeCast = this.win.chrome?.cast;
    return Boolean(framework && chromeCast);
  }

  private configureCastContext(): void {
    const context = this.getCastContext();
    if (!context || typeof context.setOptions !== 'function') {
      this.throwPluginError('initialize', 'UNSUPPORTED_PLATFORM', 'Google Cast context cannot be configured');
    }

    const options: Record<string, unknown> = {
      receiverApplicationId: this.receiverApplicationId,
      autoJoinPolicy: this.resolveAutoJoinPolicy(),
    };

    context.setOptions(options);
  }

  private setupRemotePlayer(): void {
    if (this.remotePlayer && this.remotePlayerController) {
      this.attachRemotePlayerListener();
      this.remotePlayerSnapshot = this.snapshotRemotePlayer();
      return;
    }

    const framework = this.win.cast?.framework as Record<string, unknown> | undefined;
    const remotePlayerCtor = framework?.RemotePlayer as (new () => Record<string, unknown>) | undefined;
    const remotePlayerControllerCtor = framework?.RemotePlayerController as
      | (new (player: Record<string, unknown>) => Record<string, unknown>)
      | undefined;

    if (!remotePlayerCtor || !remotePlayerControllerCtor) {
      return;
    }

    try {
      this.remotePlayer = new remotePlayerCtor();
      this.remotePlayerController = new remotePlayerControllerCtor(this.remotePlayer);
      this.attachRemotePlayerListener();
      this.remotePlayerSnapshot = this.snapshotRemotePlayer();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to initialize RemotePlayer';
      this.emitCastError('initialize', this.makeError('OPERATION_FAILED', message));
    }
  }

  private attachRemotePlayerListener(): void {
    if (this.remotePlayerListenerAttached || !this.remotePlayerController) {
      return;
    }

    const addEventListener = this.remotePlayerController.addEventListener;
    const eventTypes = this.win.cast?.framework?.RemotePlayerEventType as Record<string, string> | undefined;
    const anyChange = eventTypes?.ANY_CHANGE;
    if (!anyChange || typeof addEventListener !== 'function') {
      return;
    }

    try {
      addEventListener.call(this.remotePlayerController, anyChange, () => {
        this.remotePlayerSnapshot = this.snapshotRemotePlayer();
      });
      this.remotePlayerListenerAttached = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to attach RemotePlayer listener';
      this.emitCastError('initialize', this.makeError('OPERATION_FAILED', message));
    }
  }

  private attachCastContextListeners(): void {
    if (this.castContextListenersAttached) {
      return;
    }

    const context = this.getCastContext();
    const eventTypes = this.win.cast?.framework?.CastContextEventType as Record<string, string> | undefined;

    if (!context || !eventTypes || typeof context.addEventListener !== 'function') {
      return;
    }

    const castStateChanged = eventTypes.CAST_STATE_CHANGED;
    if (castStateChanged) {
      context.addEventListener(castStateChanged, (event: unknown) => {
        this.castStateSnapshot = this.snapshotCastStateEvent(event) ?? this.buildCastStateSnapshotFromContext();
        this.emitSessionStateChanged('CAST_STATE_CHANGED');
      });
    }

    const sessionStateChanged = eventTypes.SESSION_STATE_CHANGED;
    if (sessionStateChanged) {
      context.addEventListener(sessionStateChanged, () => {
        this.syncMessageListeners(this.getCurrentCastSession());
        this.remotePlayerSnapshot = this.snapshotRemotePlayer();
        this.castStateSnapshot = this.buildCastStateSnapshotFromContext();
        this.emitSessionStateChanged('SESSION_STATE_CHANGED');
      });
    }

    this.castContextListenersAttached = true;
  }

  private hasCustomChannelSupport(): boolean {
    if (!this.isSupported) {
      return false;
    }

    const currentSession = this.getCurrentCastSession();
    if (!currentSession) {
      return true;
    }

    return typeof currentSession.sendMessage === 'function' && typeof currentSession.addMessageListener === 'function';
  }

  private syncMessageListeners(session: Record<string, unknown> | null): void {
    if (this.attachedMessageSession && this.attachedMessageSession !== session) {
      this.detachMessageListeners(this.attachedMessageSession);
      this.attachedMessageSession = null;
      this.attachedMessageNamespaces.clear();
    }

    if (!session) {
      return;
    }

    if (this.attachedMessageSession !== session) {
      this.attachedMessageSession = session;
      this.attachedMessageNamespaces.clear();
    }

    const addMessageListener = session.addMessageListener;
    if (typeof addMessageListener !== 'function') {
      return;
    }

    for (const namespace of this.subscribedMessageNamespaces) {
      if (this.attachedMessageNamespaces.has(namespace)) {
        continue;
      }

      try {
        addMessageListener.call(session, namespace, this.sessionMessageListener);
        this.attachedMessageNamespaces.add(namespace);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to attach custom message listener';
        this.emitCastError('subscribeNamespace', this.makeError('OPERATION_FAILED', message, { namespace }));
      }
    }

    for (const namespace of [...this.attachedMessageNamespaces]) {
      if (this.subscribedMessageNamespaces.has(namespace)) {
        continue;
      }

      const removeMessageListener = session.removeMessageListener;
      if (typeof removeMessageListener !== 'function') {
        this.attachedMessageNamespaces.delete(namespace);
        continue;
      }

      try {
        removeMessageListener.call(session, namespace, this.sessionMessageListener);
      } catch {
        // Best effort cleanup.
      }
      this.attachedMessageNamespaces.delete(namespace);
    }
  }

  private detachMessageListeners(session: Record<string, unknown>): void {
    const removeMessageListener = session.removeMessageListener;
    if (typeof removeMessageListener !== 'function') {
      return;
    }

    for (const namespace of this.attachedMessageNamespaces) {
      try {
        removeMessageListener.call(session, namespace, this.sessionMessageListener);
      } catch {
        // Best effort cleanup.
      }
    }
  }

  private emitSessionStateChanged(source: string): void {
    const session = this.getCurrentCastSession();
    const castState = this.castStateSnapshot ?? this.buildCastStateSnapshotFromContext();
    const mediaStatus = this.remotePlayerSnapshot ?? this.snapshotRemotePlayer();

    this.castStateSnapshot = castState;
    this.remotePlayerSnapshot = mediaStatus;

    this.notifyListeners('sessionStateChanged', {
      source,
      castState,
      session: this.snapshotCastSession(session),
      mediaStatus,
    } as SessionStateChangedEvent);
  }

  private normalizeNamespace(namespace: unknown): string | null {
    if (typeof namespace !== 'string') {
      return null;
    }

    const trimmed = namespace.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private normalizeOutgoingMessage(message: unknown): Record<string, unknown> | string {
    if (typeof message === 'string') {
      return message;
    }

    if (!this.isPlainRecord(message)) {
      this.throwPluginError('sendMessage', 'INVALID_ARGUMENT', 'sendMessage.message must be a string or plain object');
    }

    try {
      JSON.stringify(message);
    } catch {
      this.throwPluginError('sendMessage', 'INVALID_ARGUMENT', 'sendMessage.message must be JSON serializable');
    }

    return message;
  }

  private emitMessageReceived(namespace: string, payload: unknown): void {
    const normalized = this.normalizeIncomingMessage(payload);
    this.notifyListeners('messageReceived', {
      namespace,
      message: normalized.message,
      raw: normalized.raw,
    } as MessageReceivedEvent);
  }

  private normalizeIncomingMessage(payload: unknown): { message: Record<string, unknown> | string; raw?: string } {
    if (typeof payload === 'string') {
      const parsed = this.tryParseJsonObject(payload);
      if (parsed) {
        return { message: parsed, raw: payload };
      }

      return { message: payload, raw: payload };
    }

    if (this.isPlainRecord(payload)) {
      return { message: payload };
    }

    let fallback = 'Unsupported message payload';
    try {
      const serialized = JSON.stringify(payload);
      if (serialized) {
        fallback = serialized;
      }
    } catch {
      // Keep fallback.
    }

    return { message: fallback };
  }

  private tryParseJsonObject(value: string): Record<string, unknown> | null {
    try {
      const parsed = JSON.parse(value);
      return this.isPlainRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private getCastContext(): Record<string, unknown> | null {
    const castFramework = this.win.cast?.framework as Record<string, unknown> | undefined;
    const castContext = castFramework?.CastContext as Record<string, unknown> | undefined;
    const getInstance = castContext?.getInstance;

    if (!castContext || typeof getInstance !== 'function') {
      return null;
    }

    return getInstance.call(castContext) as Record<string, unknown>;
  }

  private getCurrentCastSession(): Record<string, unknown> | null {
    const context = this.getCastContext();
    if (!context) {
      return null;
    }

    const getCurrentSession = context.getCurrentSession;
    if (typeof getCurrentSession !== 'function') {
      return null;
    }

    return (getCurrentSession.call(context) as Record<string, unknown> | null) ?? null;
  }

  private snapshotCastStateEvent(event: unknown): CastStateSnapshot {
    const snapshot = this.toSerializable(event);
    return this.isPlainRecord(snapshot) ? snapshot : null;
  }

  private buildCastStateSnapshotFromContext(): CastStateSnapshot {
    const context = this.getCastContext();
    if (!context) {
      return null;
    }

    const getCastState = context.getCastState;
    if (typeof getCastState !== 'function') {
      return null;
    }

    const castState = getCastState.call(context);
    if (typeof castState === 'string') {
      return { castState };
    }

    const snapshot = this.toSerializable(castState);
    return this.isPlainRecord(snapshot) ? snapshot : null;
  }

  private snapshotRemotePlayer(): CastMediaStatusSnapshot | null {
    if (!this.remotePlayer) {
      this.setupRemotePlayer();
    }

    if (!this.remotePlayer) {
      return null;
    }

    const snapshot = this.toSerializable(this.remotePlayer);
    return this.isPlainRecord(snapshot) ? snapshot : null;
  }

  private snapshotCastSession(rawSession: Record<string, unknown> | null): CastSessionSnapshot | null {
    if (!rawSession) {
      return null;
    }

    const getSessionObj = rawSession.getSessionObj;
    const sessionObject = typeof getSessionObj === 'function' ? getSessionObj.call(rawSession) : rawSession;
    const snapshot = this.toSerializable(sessionObject);

    if (this.isPlainRecord(snapshot)) {
      return snapshot;
    }

    return { session: snapshot };
  }

  private getActiveMediaSession(): Record<string, unknown> {
    const session = this.getCurrentCastSession();
    if (!session) {
      this.throwPluginError('media', 'NO_ACTIVE_SESSION', 'No active cast session');
    }

    const mediaSession = this.extractMediaSession(session);
    if (!mediaSession) {
      this.throwPluginError('media', 'OPERATION_FAILED', 'No active media session');
    }

    return mediaSession;
  }

  private extractMediaSession(session: Record<string, unknown>): Record<string, unknown> | null {
    const getMediaSession = session.getMediaSession;
    if (typeof getMediaSession === 'function') {
      const media = getMediaSession.call(session);
      if (this.isPlainRecord(media)) {
        return media;
      }
    }

    const getSessionObj = session.getSessionObj;
    if (typeof getSessionObj !== 'function') {
      return null;
    }

    const sessionObj = getSessionObj.call(session);
    if (!this.isPlainRecord(sessionObj)) {
      return null;
    }

    const mediaList = sessionObj.media;
    if (!Array.isArray(mediaList) || mediaList.length === 0) {
      return null;
    }

    const firstMedia = mediaList[0];
    return this.isPlainRecord(firstMedia) ? firstMedia : null;
  }

  private resolveAutoJoinPolicy(): unknown {
    const policyKey = this.autoJoinPolicy.toLowerCase();
    const autoJoinPolicy = this.win.chrome?.cast?.AutoJoinPolicy as Record<string, unknown> | undefined;

    if (!autoJoinPolicy) {
      return this.autoJoinPolicy;
    }

    switch (policyKey) {
      case 'tab_and_origin_scoped':
        return autoJoinPolicy.TAB_AND_ORIGIN_SCOPED ?? this.autoJoinPolicy;
      case 'page_scoped':
        return autoJoinPolicy.PAGE_SCOPED ?? this.autoJoinPolicy;
      case 'origin_scoped':
      default:
        return autoJoinPolicy.ORIGIN_SCOPED ?? this.autoJoinPolicy;
    }
  }

  private getChromeCastMediaNamespace(): Record<string, unknown> {
    const mediaNamespace = this.win.chrome?.cast?.media as Record<string, unknown> | undefined;
    if (!mediaNamespace) {
      this.throwPluginError('loadMedia', 'UNSUPPORTED_PLATFORM', 'chrome.cast.media namespace is unavailable');
    }

    return mediaNamespace;
  }

  private createMediaInfo(mediaNamespace: Record<string, unknown>, request: LoadMediaRequest): unknown {
    const mediaInfoCtor = mediaNamespace.MediaInfo as
      | (new (contentId: string, contentType: string) => Record<string, unknown>)
      | undefined;

    if (!mediaInfoCtor) {
      this.throwPluginError('loadMedia', 'UNSUPPORTED_PLATFORM', 'MediaInfo constructor is unavailable');
    }

    const mediaInfo = new mediaInfoCtor(request.url, request.contentType);

    if (request.streamType) {
      mediaInfo.streamType = request.streamType;
    }

    const metadata = this.buildMetadata(mediaNamespace, request);
    if (metadata) {
      mediaInfo.metadata = metadata;
    }

    if (request.customData) {
      mediaInfo.customData = request.customData;
    }

    if (request.tracks) {
      mediaInfo.tracks = request.tracks.map((track) => ({ ...track }));
    }

    return mediaInfo;
  }

  private buildMetadata(
    mediaNamespace: Record<string, unknown>,
    request: LoadMediaRequest,
  ): Record<string, unknown> | null {
    const metadataCtor = mediaNamespace.GenericMediaMetadata as (new () => Record<string, unknown>) | undefined;

    if (!metadataCtor) {
      return null;
    }

    const metadata = new metadataCtor();

    const title = request.title ?? request.metadata?.title;
    const subtitle = request.subtitle ?? request.metadata?.subtitle;

    if (title) {
      metadata.title = title;
    }

    if (subtitle) {
      metadata.subtitle = subtitle;
    }

    if (request.metadata?.studio) {
      metadata.studio = request.metadata.studio;
    }

    if (request.metadata?.releaseDate) {
      metadata.releaseDate = request.metadata.releaseDate;
    }

    const images = this.buildMetadataImages(request.posterUrl, request.metadata?.images);
    if (images.length > 0) {
      metadata.images = images;
    }

    if (request.metadata?.customData) {
      metadata.customData = request.metadata.customData;
    }

    return metadata;
  }

  private buildMetadataImages(posterUrl?: string, metadataImages?: string[]): (Record<string, unknown> | unknown)[] {
    const imageUrls = [posterUrl, ...(metadataImages ?? [])].filter(
      (url): url is string => typeof url === 'string' && url.length > 0,
    );

    const imageCtor = this.win.chrome?.cast?.Image as (new (url: string) => unknown) | undefined;
    return imageUrls.map((url) => (imageCtor ? new imageCtor(url) : { url }));
  }

  private createLoadRequest(
    mediaNamespace: Record<string, unknown>,
    mediaInfo: unknown,
    request: LoadMediaRequest,
  ): Record<string, unknown> {
    const loadRequestCtor = mediaNamespace.LoadRequest as
      | (new (mediaInfoArg: unknown) => Record<string, unknown>)
      | undefined;

    if (!loadRequestCtor) {
      this.throwPluginError('loadMedia', 'UNSUPPORTED_PLATFORM', 'LoadRequest constructor is unavailable');
    }

    const loadRequest = new loadRequestCtor(mediaInfo);

    if (typeof request.autoplay === 'boolean') {
      loadRequest.autoplay = request.autoplay;
    }

    if (typeof request.currentTime === 'number') {
      loadRequest.currentTime = request.currentTime;
    }

    if (request.activeTrackIds) {
      loadRequest.activeTrackIds = request.activeTrackIds;
    }

    if (request.customData) {
      loadRequest.customData = request.customData;
    }

    return loadRequest;
  }

  private createSeekRequest(mediaNamespace: Record<string, unknown>, position: number): Record<string, unknown> {
    const seekRequestCtor = mediaNamespace.SeekRequest as (new () => Record<string, unknown>) | undefined;
    const seekRequest = seekRequestCtor ? new seekRequestCtor() : {};
    seekRequest.currentTime = position;
    return seekRequest;
  }

  private extractRequestId(loadResult: unknown): string | undefined {
    if (!this.isPlainRecord(loadResult)) {
      return undefined;
    }

    const requestId = loadResult.requestId;
    if (typeof requestId === 'number' || typeof requestId === 'string') {
      return String(requestId);
    }

    return undefined;
  }

  private async invokeCastMethod(
    target: Record<string, unknown>,
    methodName: string,
    args: unknown[],
  ): Promise<unknown> {
    const method = target[methodName];
    if (typeof method !== 'function') {
      this.throwPluginError(methodName, 'OPERATION_FAILED', `Cast method ${methodName} is unavailable`);
    }

    const methodFunction = method as (...callArgs: unknown[]) => unknown;

    return new Promise((resolve, reject) => {
      let settled = false;

      const resolveOnce = (value?: unknown): void => {
        if (!settled) {
          settled = true;
          resolve(value);
        }
      };

      const rejectOnce = (reason?: unknown): void => {
        if (!settled) {
          settled = true;
          reject(reason);
        }
      };

      let returnValue: unknown;
      try {
        returnValue = methodFunction.apply(target, [...args, resolveOnce, rejectOnce]);
      } catch (error) {
        rejectOnce(error);
        return;
      }

      if (this.isPromiseLike(returnValue)) {
        (returnValue as Promise<unknown>).then(resolveOnce).catch(rejectOnce);
        return;
      }

      if (methodFunction.length <= args.length) {
        resolveOnce(returnValue);
      }
    });
  }

  private async invokeSessionRequestMethod(
    target: Record<string, unknown>,
    methodName: 'requestSession',
    args: unknown[],
  ): Promise<void> {
    const method = target[methodName];
    if (typeof method !== 'function') {
      this.throwPluginError(methodName, 'OPERATION_FAILED', `Cast method ${methodName} is unavailable`);
    }

    const returnValue = (method as (...callArgs: unknown[]) => unknown).apply(target, args);
    if (this.isPromiseLike(returnValue)) {
      await returnValue;
    }
  }

  private throwPluginError(
    method: string,
    code: CastErrorCode,
    message: string,
    data?: Record<string, unknown>,
  ): never {
    const error = this.makeError(code, message, data);
    this.emitCastError(method, error);
    throw error;
  }

  private handleCaughtError(method: string, error: unknown): CastPluginError {
    if (this.isCastPluginError(error)) {
      this.emitCastError(method, error);
      return error;
    }

    const message = error instanceof Error && error.message ? error.message : 'Unexpected cast operation failure';
    const wrappedError = this.makeError('OPERATION_FAILED', message);
    this.emitCastError(method, wrappedError);
    return wrappedError;
  }

  private makeError(code: CastErrorCode, message: string, data?: Record<string, unknown>): CastPluginError {
    const error = new Error(message) as CastPluginError;
    error.code = code;
    if (data) {
      error.data = data;
    }

    return error;
  }

  private emitCastError(method: string, error: CastPluginError): void {
    this.notifyListeners('castError', {
      code: error.code,
      message: error.message,
      method,
      data: error.data,
    } as CastErrorEvent);
  }

  private isCastPluginError(error: unknown): error is CastPluginError {
    if (!(error instanceof Error)) {
      return false;
    }

    const castError = error as Partial<CastPluginError>;
    return typeof castError.code === 'string' && this.isValidErrorCode(castError.code);
  }

  private isValidUiMode(value: string): value is CastUiMode {
    return VALID_UI_MODES.includes(value as CastUiMode);
  }

  private isValidErrorCode(value: string): value is CastErrorCode {
    return VALID_ERROR_CODES.includes(value as CastErrorCode);
  }

  private isPromiseLike(value: unknown): value is Promise<unknown> {
    return Boolean(
      value &&
      (typeof value === 'object' || typeof value === 'function') &&
      typeof (value as { then?: unknown }).then === 'function',
    );
  }

  private isPlainRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  private toSerializable(value: unknown, depth = 0): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    if (depth > 6) {
      return undefined;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.toSerializable(item, depth + 1)).filter((item) => item !== undefined);
    }

    if (this.isPlainRecord(value)) {
      const entries = Object.entries(value)
        .map(([key, item]) => [key, this.toSerializable(item, depth + 1)] as const)
        .filter(([, item]) => item !== undefined);
      return Object.fromEntries(entries);
    }

    const toJSON = (value as { toJSON?: () => unknown }).toJSON;
    if (typeof toJSON === 'function') {
      return this.toSerializable(toJSON.call(value), depth + 1);
    }

    return undefined;
  }

  private get win(): CastSenderGlobal {
    return globalThis as unknown as CastSenderGlobal;
  }

  private asString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }
}
