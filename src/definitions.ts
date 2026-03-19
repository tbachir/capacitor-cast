import type { PermissionState, PluginListenerHandle } from '@capacitor/core';

export type CastUiMode = 'picker' | 'nativeButton' | 'headless';

export type CastErrorCode =
  | 'UNSUPPORTED_PLATFORM'
  | 'NOT_INITIALIZED'
  | 'NO_ACTIVE_SESSION'
  | 'INVALID_ARGUMENT'
  | 'UI_MODE_NOT_AVAILABLE'
  | 'OPERATION_FAILED';

export type CastStreamType = 'BUFFERED' | 'LIVE' | 'OTHER';

export interface CastTrack {
  trackId: number;
  type: 'TEXT' | 'AUDIO' | 'VIDEO';
  name?: string;
  language?: string;
  subtype?: string;
  contentId?: string;
  contentType?: string;
  customData?: Record<string, unknown>;
}

export interface CastMediaMetadata {
  title?: string;
  subtitle?: string;
  studio?: string;
  releaseDate?: string;
  images?: string[];
  customData?: Record<string, unknown>;
}

export interface LoadMediaRequest {
  /**
   * Media URL reachable by the receiver device.
   */
  url: string;
  /**
   * MIME type of the media (for example `video/mp4`).
   */
  contentType: string;
  /**
   * Convenience title field mapped to receiver metadata.
   */
  title?: string;
  /**
   * Convenience subtitle field mapped to receiver metadata.
   */
  subtitle?: string;
  /**
   * Poster image URL added to metadata images when provided.
   */
  posterUrl?: string;
  /**
   * Stream type used by Cast receivers.
   */
  streamType?: CastStreamType;
  /**
   * Whether playback should start automatically after load.
   */
  autoplay?: boolean;
  /**
   * Initial playback position in seconds.
   */
  currentTime?: number;
  /**
   * Custom payload forwarded to the receiver load request.
   */
  customData?: Record<string, unknown>;
  /**
   * Optional text/audio/video tracks for the media item.
   */
  tracks?: CastTrack[];
  /**
   * Active track identifiers to enable right after loading.
   */
  activeTrackIds?: number[];
  /**
   * Optional metadata payload merged with convenience fields.
   */
  metadata?: CastMediaMetadata;
}

export interface InitializeResult {
  isSupported: boolean;
  uiMode: CastUiMode;
  receiverApplicationId: string;
}

export interface IsInitializedResult {
  isInitialized: boolean;
}

export interface CastPermissionStatus {
  localNetwork: PermissionState;
}

export interface CastCapabilities {
  isSupported: boolean;
  canRequestSession: boolean;
  canShowDevicePicker: boolean;
  supportsMediaControl: boolean;
  supportsVolumeControl: boolean;
  supportsCustomChannels: boolean;
}

/**
 * Raw cast state snapshot (platform-specific shape).
 */
export type CastStateSnapshot = Record<string, unknown> | null;

/**
 * Raw session snapshot (platform-specific shape).
 */
export type CastSessionSnapshot = Record<string, unknown>;

/**
 * Raw media status snapshot (platform-specific shape).
 */
export type CastMediaStatusSnapshot = Record<string, unknown>;

export interface CastStateResult {
  castState: CastStateSnapshot;
}

export interface SessionResult {
  session: CastSessionSnapshot | null;
}

export interface MediaStatusResult {
  mediaStatus: CastMediaStatusSnapshot | null;
}

export interface LoadMediaResult {
  requestId?: string;
}

export interface SeekOptions {
  position: number;
}

export interface SetVolumeOptions {
  level: number;
}

export interface SetMutedOptions {
  muted: boolean;
}

export interface EndSessionOptions {
  stopCasting?: boolean;
}

export interface SendMessageOptions {
  /**
   * Cast message namespace (for example `urn:x-cast:com.example.channel`).
   */
  namespace: string;
  /**
   * Message payload sent to the receiver.
   */
  message: Record<string, unknown> | string;
}

export interface NamespaceOptions {
  /**
   * Cast message namespace (for example `urn:x-cast:com.example.channel`).
   */
  namespace: string;
}

export interface ConnectToDeviceOptions {
  /**
   * Platform-specific identifier returned by `getDiscoveredDevices()`.
   */
  deviceId: string;
}

export interface CastDevice {
  /** Platform-specific device identifier. */
  deviceId: string;
  /** Human-readable device name (e.g. "Living Room TV"). */
  friendlyName: string;
  /** Device model name when available. */
  modelName?: string;
  /** Whether this device is the one currently connected. */
  isConnected: boolean;
}

export interface DiscoveredDevicesResult {
  devices: CastDevice[];
}

export interface CastErrorEvent {
  /**
   * Stable plugin error code.
   */
  code: CastErrorCode;
  /**
   * Human-readable error message.
   */
  message: string;
  /**
   * Plugin method that emitted or propagated the error.
   */
  method?: string;
  /**
   * Optional platform-specific diagnostic payload.
   */
  data?: Record<string, unknown>;
}

export interface MessageReceivedEvent {
  /**
   * Namespace on which the message was received.
   */
  namespace: string;
  /**
   * Parsed message payload when JSON object parsing succeeds, otherwise raw string.
   */
  message: Record<string, unknown> | string;
  /**
   * Raw message string when available from the Cast SDK.
   */
  raw?: string;
}

export interface SessionStateChangedEvent {
  /**
   * Event source emitted by the underlying platform SDK.
   */
  source?: string;
  /**
   * Latest cast state snapshot.
   */
  castState: CastStateSnapshot;
  /**
   * Latest cast session snapshot, if any.
   */
  session: CastSessionSnapshot | null;
  /**
   * Latest media status snapshot, if any.
   */
  mediaStatus: CastMediaStatusSnapshot | null;
}

export interface CastPlugin {
  /**
   * Returns whether the plugin has been initialized.
   */
  isInitialized(): Promise<IsInitializedResult>;

  /**
   * Returns the current local network permission status.
   * This method is non-intrusive and never triggers the OS permission prompt.
   */
  checkPermissions(): Promise<CastPermissionStatus>;

  /**
   * Requests local network permission when applicable.
   * This is the only API that may trigger the OS permission prompt.
   */
  requestPermissions(): Promise<CastPermissionStatus>;

  /**
   * Initializes the plugin from `capacitor.config.*` values.
   * Call this explicitly when `autoInitialize` is disabled in Capacitor config.
   */
  initialize(): Promise<InitializeResult>;

  /**
   * Returns the capabilities for the current platform/runtime.
   */
  getCapabilities(): Promise<CastCapabilities>;

  /**
   * Returns the current cast state from the underlying SDK.
   */
  getCastState(): Promise<CastStateResult>;

  /**
   * Returns the currently active cast session snapshot if any.
   */
  getSession(): Promise<SessionResult>;

  /**
   * Requests a cast session.
   */
  requestSession(): Promise<void>;

  /**
   * Opens the cast device picker when available for the configured UI mode.
   */
  showDevicePicker(): Promise<void>;

  /**
   * Connects directly to a discovered cast device.
   */
  connectToDevice(options: ConnectToDeviceOptions): Promise<void>;

  /**
   * Ends the active cast session.
   */
  endSession(options?: EndSessionOptions): Promise<void>;

  /**
   * Loads media in the active cast session.
   */
  loadMedia(request: LoadMediaRequest): Promise<LoadMediaResult>;

  /**
   * Resumes playback for the active media item.
   */
  play(): Promise<void>;

  /**
   * Pauses playback for the active media item.
   */
  pause(): Promise<void>;

  /**
   * Stops playback for the active media item.
   */
  stop(): Promise<void>;

  /**
   * Seeks the active media item to a position in seconds.
   */
  seek(options: SeekOptions): Promise<void>;

  /**
   * Sets remote device volume in range [0, 1].
   */
  setVolume(options: SetVolumeOptions): Promise<void>;

  /**
   * Sets remote device muted state.
   */
  setMuted(options: SetMutedOptions): Promise<void>;

  /**
   * Returns the current media status snapshot if available.
   */
  getMediaStatus(): Promise<MediaStatusResult>;

  /**
   * Returns the list of Cast devices currently discovered on the network.
   * On web the list is always empty — use `requestSession()` instead.
   */
  getDiscoveredDevices(): Promise<DiscoveredDevicesResult>;

  /**
   * Restarts cast discovery and emits an updated devices list.
   */
  rescanDevices(): Promise<DiscoveredDevicesResult>;

  /**
   * Opens the app's system settings page (useful to guide the user after a
   * permission denial).
   */
  openSettings(): Promise<void>;

  /**
   * Sends a custom message to the active cast session on the provided namespace.
   */
  sendMessage(options: SendMessageOptions): Promise<void>;

  /**
   * Subscribes native/web SDK message callbacks for an explicit namespace.
   */
  subscribeNamespace(options: NamespaceOptions): Promise<void>;

  /**
   * Unsubscribes native/web SDK message callbacks for an explicit namespace.
   */
  unsubscribeNamespace(options: NamespaceOptions): Promise<void>;

  /**
   * Listens for typed cast errors.
   */
  addListener(eventName: 'castError', listenerFunc: (event: CastErrorEvent) => void): Promise<PluginListenerHandle>;

  /**
   * Listens for incoming custom namespace messages.
   */
  addListener(
    eventName: 'messageReceived',
    listenerFunc: (event: MessageReceivedEvent) => void,
  ): Promise<PluginListenerHandle>;

  /**
   * Listens for session lifecycle and state updates emitted by the Cast SDK.
   */
  addListener(
    eventName: 'sessionStateChanged',
    listenerFunc: (event: SessionStateChangedEvent) => void,
  ): Promise<PluginListenerHandle>;

  /**
   * Listens for changes to the list of discovered Cast devices on the network.
   */
  addListener(
    eventName: 'devicesChanged',
    listenerFunc: (result: DiscoveredDevicesResult) => void,
  ): Promise<PluginListenerHandle>;

  /**
   * Removes all plugin listeners.
   */
  removeAllListeners(): Promise<void>;
}
