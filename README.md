# @strasberry/capacitor-cast

Capacitor plugin that enables Cast functionality for web, iOS, and Android.

## Install

To use npm

```bash
npm install @strasberry/capacitor-cast
````

To use yarn

```bash
yarn add @strasberry/capacitor-cast
```

Sync native files

```bash
npx cap sync
```

## API

<docgen-index>

* [`isInitialized()`](#isinitialized)
* [`checkPermissions()`](#checkpermissions)
* [`requestPermissions()`](#requestpermissions)
* [`initialize()`](#initialize)
* [`getCapabilities()`](#getcapabilities)
* [`getCastState()`](#getcaststate)
* [`getSession()`](#getsession)
* [`requestSession()`](#requestsession)
* [`showDevicePicker()`](#showdevicepicker)
* [`endSession(...)`](#endsession)
* [`loadMedia(...)`](#loadmedia)
* [`play()`](#play)
* [`pause()`](#pause)
* [`stop()`](#stop)
* [`seek(...)`](#seek)
* [`setVolume(...)`](#setvolume)
* [`setMuted(...)`](#setmuted)
* [`getMediaStatus()`](#getmediastatus)
* [`getDiscoveredDevices()`](#getdiscovereddevices)
* [`openSettings()`](#opensettings)
* [`sendMessage(...)`](#sendmessage)
* [`subscribeNamespace(...)`](#subscribenamespace)
* [`unsubscribeNamespace(...)`](#unsubscribenamespace)
* [`addListener('castError', ...)`](#addlistenercasterror-)
* [`addListener('messageReceived', ...)`](#addlistenermessagereceived-)
* [`addListener('sessionStateChanged', ...)`](#addlistenersessionstatechanged-)
* [`addListener('devicesChanged', ...)`](#addlistenerdeviceschanged-)
* [`removeAllListeners()`](#removealllisteners)
* [Interfaces](#interfaces)
* [Type Aliases](#type-aliases)

</docgen-index>

<docgen-api>
<!--Update the source file JSDoc comments and rerun docgen to update the docs below-->

### isInitialized()

```typescript
isInitialized() => Promise<IsInitializedResult>
```

Returns whether the plugin has been initialized.

**Returns:** <code>Promise&lt;<a href="#isinitializedresult">IsInitializedResult</a>&gt;</code>

--------------------


### checkPermissions()

```typescript
checkPermissions() => Promise<CastPermissionStatus>
```

Returns the current local network permission status.

**Returns:** <code>Promise&lt;<a href="#castpermissionstatus">CastPermissionStatus</a>&gt;</code>

--------------------


### requestPermissions()

```typescript
requestPermissions() => Promise<CastPermissionStatus>
```

Requests local network permission when applicable.

**Returns:** <code>Promise&lt;<a href="#castpermissionstatus">CastPermissionStatus</a>&gt;</code>

--------------------


### initialize()

```typescript
initialize() => Promise<InitializeResult>
```

Initializes the plugin from `capacitor.config.*` values.

**Returns:** <code>Promise&lt;<a href="#initializeresult">InitializeResult</a>&gt;</code>

--------------------


### getCapabilities()

```typescript
getCapabilities() => Promise<CastCapabilities>
```

Returns the capabilities for the current platform/runtime.

**Returns:** <code>Promise&lt;<a href="#castcapabilities">CastCapabilities</a>&gt;</code>

--------------------


### getCastState()

```typescript
getCastState() => Promise<CastStateResult>
```

Returns the current cast state from the underlying SDK.

**Returns:** <code>Promise&lt;<a href="#caststateresult">CastStateResult</a>&gt;</code>

--------------------


### getSession()

```typescript
getSession() => Promise<SessionResult>
```

Returns the currently active cast session snapshot if any.

**Returns:** <code>Promise&lt;<a href="#sessionresult">SessionResult</a>&gt;</code>

--------------------


### requestSession()

```typescript
requestSession() => Promise<void>
```

Requests a cast session.

--------------------


### showDevicePicker()

```typescript
showDevicePicker() => Promise<void>
```

Opens the cast device picker when available for the configured UI mode.

--------------------


### endSession(...)

```typescript
endSession(options?: EndSessionOptions | undefined) => Promise<void>
```

Ends the active cast session.

| Param         | Type                                                            |
| ------------- | --------------------------------------------------------------- |
| **`options`** | <code><a href="#endsessionoptions">EndSessionOptions</a></code> |

--------------------


### loadMedia(...)

```typescript
loadMedia(request: LoadMediaRequest) => Promise<LoadMediaResult>
```

Loads media in the active cast session.

| Param         | Type                                                          |
| ------------- | ------------------------------------------------------------- |
| **`request`** | <code><a href="#loadmediarequest">LoadMediaRequest</a></code> |

**Returns:** <code>Promise&lt;<a href="#loadmediaresult">LoadMediaResult</a>&gt;</code>

--------------------


### play()

```typescript
play() => Promise<void>
```

Resumes playback for the active media item.

--------------------


### pause()

```typescript
pause() => Promise<void>
```

Pauses playback for the active media item.

--------------------


### stop()

```typescript
stop() => Promise<void>
```

Stops playback for the active media item.

--------------------


### seek(...)

```typescript
seek(options: SeekOptions) => Promise<void>
```

Seeks the active media item to a position in seconds.

| Param         | Type                                                |
| ------------- | --------------------------------------------------- |
| **`options`** | <code><a href="#seekoptions">SeekOptions</a></code> |

--------------------


### setVolume(...)

```typescript
setVolume(options: SetVolumeOptions) => Promise<void>
```

Sets remote device volume in range [0, 1].

| Param         | Type                                                          |
| ------------- | ------------------------------------------------------------- |
| **`options`** | <code><a href="#setvolumeoptions">SetVolumeOptions</a></code> |

--------------------


### setMuted(...)

```typescript
setMuted(options: SetMutedOptions) => Promise<void>
```

Sets remote device muted state.

| Param         | Type                                                        |
| ------------- | ----------------------------------------------------------- |
| **`options`** | <code><a href="#setmutedoptions">SetMutedOptions</a></code> |

--------------------


### getMediaStatus()

```typescript
getMediaStatus() => Promise<MediaStatusResult>
```

Returns the current media status snapshot if available.

**Returns:** <code>Promise&lt;<a href="#mediastatusresult">MediaStatusResult</a>&gt;</code>

--------------------


### getDiscoveredDevices()

```typescript
getDiscoveredDevices() => Promise<DiscoveredDevicesResult>
```

Returns the list of Cast devices currently discovered on the network.
On web the list is always empty — use `requestSession()` instead.

**Returns:** <code>Promise&lt;<a href="#discovereddevicesresult">DiscoveredDevicesResult</a>&gt;</code>

--------------------


### openSettings()

```typescript
openSettings() => Promise<void>
```

Opens the app's system settings page (useful to guide the user after a
permission denial).

--------------------


### sendMessage(...)

```typescript
sendMessage(options: SendMessageOptions) => Promise<void>
```

Sends a custom message to the active cast session on the provided namespace.

| Param         | Type                                                              |
| ------------- | ----------------------------------------------------------------- |
| **`options`** | <code><a href="#sendmessageoptions">SendMessageOptions</a></code> |

--------------------


### subscribeNamespace(...)

```typescript
subscribeNamespace(options: NamespaceOptions) => Promise<void>
```

Subscribes native/web SDK message callbacks for an explicit namespace.

| Param         | Type                                                          |
| ------------- | ------------------------------------------------------------- |
| **`options`** | <code><a href="#namespaceoptions">NamespaceOptions</a></code> |

--------------------


### unsubscribeNamespace(...)

```typescript
unsubscribeNamespace(options: NamespaceOptions) => Promise<void>
```

Unsubscribes native/web SDK message callbacks for an explicit namespace.

| Param         | Type                                                          |
| ------------- | ------------------------------------------------------------- |
| **`options`** | <code><a href="#namespaceoptions">NamespaceOptions</a></code> |

--------------------


### addListener('castError', ...)

```typescript
addListener(eventName: 'castError', listenerFunc: (event: CastErrorEvent) => void) => Promise<PluginListenerHandle>
```

Listens for typed cast errors.

| Param              | Type                                                                          |
| ------------------ | ----------------------------------------------------------------------------- |
| **`eventName`**    | <code>'castError'</code>                                                      |
| **`listenerFunc`** | <code>(event: <a href="#casterrorevent">CastErrorEvent</a>) =&gt; void</code> |

**Returns:** <code>Promise&lt;<a href="#pluginlistenerhandle">PluginListenerHandle</a>&gt;</code>

--------------------


### addListener('messageReceived', ...)

```typescript
addListener(eventName: 'messageReceived', listenerFunc: (event: MessageReceivedEvent) => void) => Promise<PluginListenerHandle>
```

Listens for incoming custom namespace messages.

| Param              | Type                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------- |
| **`eventName`**    | <code>'messageReceived'</code>                                                            |
| **`listenerFunc`** | <code>(event: <a href="#messagereceivedevent">MessageReceivedEvent</a>) =&gt; void</code> |

**Returns:** <code>Promise&lt;<a href="#pluginlistenerhandle">PluginListenerHandle</a>&gt;</code>

--------------------


### addListener('sessionStateChanged', ...)

```typescript
addListener(eventName: 'sessionStateChanged', listenerFunc: (event: SessionStateChangedEvent) => void) => Promise<PluginListenerHandle>
```

Listens for session lifecycle and state updates emitted by the Cast SDK.

| Param              | Type                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| **`eventName`**    | <code>'sessionStateChanged'</code>                                                                |
| **`listenerFunc`** | <code>(event: <a href="#sessionstatechangedevent">SessionStateChangedEvent</a>) =&gt; void</code> |

**Returns:** <code>Promise&lt;<a href="#pluginlistenerhandle">PluginListenerHandle</a>&gt;</code>

--------------------


### addListener('devicesChanged', ...)

```typescript
addListener(eventName: 'devicesChanged', listenerFunc: (result: DiscoveredDevicesResult) => void) => Promise<PluginListenerHandle>
```

Listens for changes to the list of discovered Cast devices on the network.

| Param              | Type                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| **`eventName`**    | <code>'devicesChanged'</code>                                                                    |
| **`listenerFunc`** | <code>(result: <a href="#discovereddevicesresult">DiscoveredDevicesResult</a>) =&gt; void</code> |

**Returns:** <code>Promise&lt;<a href="#pluginlistenerhandle">PluginListenerHandle</a>&gt;</code>

--------------------


### removeAllListeners()

```typescript
removeAllListeners() => Promise<void>
```

Removes all plugin listeners.

--------------------


### Interfaces


#### IsInitializedResult

| Prop                | Type                 |
| ------------------- | -------------------- |
| **`isInitialized`** | <code>boolean</code> |


#### CastPermissionStatus

| Prop               | Type                                                        |
| ------------------ | ----------------------------------------------------------- |
| **`localNetwork`** | <code><a href="#permissionstate">PermissionState</a></code> |


#### InitializeResult

| Prop                        | Type                                              |
| --------------------------- | ------------------------------------------------- |
| **`isSupported`**           | <code>boolean</code>                              |
| **`uiMode`**                | <code><a href="#castuimode">CastUiMode</a></code> |
| **`receiverApplicationId`** | <code>string</code>                               |


#### CastCapabilities

| Prop                         | Type                 |
| ---------------------------- | -------------------- |
| **`isSupported`**            | <code>boolean</code> |
| **`canRequestSession`**      | <code>boolean</code> |
| **`canShowDevicePicker`**    | <code>boolean</code> |
| **`supportsMediaControl`**   | <code>boolean</code> |
| **`supportsVolumeControl`**  | <code>boolean</code> |
| **`supportsCustomChannels`** | <code>boolean</code> |


#### CastStateResult

| Prop            | Type                                                            |
| --------------- | --------------------------------------------------------------- |
| **`castState`** | <code><a href="#caststatesnapshot">CastStateSnapshot</a></code> |


#### SessionResult

| Prop          | Type                                                                        |
| ------------- | --------------------------------------------------------------------------- |
| **`session`** | <code><a href="#castsessionsnapshot">CastSessionSnapshot</a> \| null</code> |


#### EndSessionOptions

| Prop              | Type                 |
| ----------------- | -------------------- |
| **`stopCasting`** | <code>boolean</code> |


#### LoadMediaResult

| Prop            | Type                |
| --------------- | ------------------- |
| **`requestId`** | <code>string</code> |


#### LoadMediaRequest

| Prop                 | Type                                                             | Description                                               |
| -------------------- | ---------------------------------------------------------------- | --------------------------------------------------------- |
| **`url`**            | <code>string</code>                                              | Media URL reachable by the receiver device.               |
| **`contentType`**    | <code>string</code>                                              | MIME type of the media (for example `video/mp4`).         |
| **`title`**          | <code>string</code>                                              | Convenience title field mapped to receiver metadata.      |
| **`subtitle`**       | <code>string</code>                                              | Convenience subtitle field mapped to receiver metadata.   |
| **`posterUrl`**      | <code>string</code>                                              | Poster image URL added to metadata images when provided.  |
| **`streamType`**     | <code><a href="#caststreamtype">CastStreamType</a></code>        | Stream type used by Cast receivers.                       |
| **`autoplay`**       | <code>boolean</code>                                             | Whether playback should start automatically after load.   |
| **`currentTime`**    | <code>number</code>                                              | Initial playback position in seconds.                     |
| **`customData`**     | <code><a href="#record">Record</a>&lt;string, unknown&gt;</code> | Custom payload forwarded to the receiver load request.    |
| **`tracks`**         | <code>CastTrack[]</code>                                         | Optional text/audio/video tracks for the media item.      |
| **`activeTrackIds`** | <code>number[]</code>                                            | Active track identifiers to enable right after loading.   |
| **`metadata`**       | <code><a href="#castmediametadata">CastMediaMetadata</a></code>  | Optional metadata payload merged with convenience fields. |


#### CastTrack

| Prop              | Type                                                             |
| ----------------- | ---------------------------------------------------------------- |
| **`trackId`**     | <code>number</code>                                              |
| **`type`**        | <code>'TEXT' \| 'AUDIO' \| 'VIDEO'</code>                        |
| **`name`**        | <code>string</code>                                              |
| **`language`**    | <code>string</code>                                              |
| **`subtype`**     | <code>string</code>                                              |
| **`contentId`**   | <code>string</code>                                              |
| **`contentType`** | <code>string</code>                                              |
| **`customData`**  | <code><a href="#record">Record</a>&lt;string, unknown&gt;</code> |


#### CastMediaMetadata

| Prop              | Type                                                             |
| ----------------- | ---------------------------------------------------------------- |
| **`title`**       | <code>string</code>                                              |
| **`subtitle`**    | <code>string</code>                                              |
| **`studio`**      | <code>string</code>                                              |
| **`releaseDate`** | <code>string</code>                                              |
| **`images`**      | <code>string[]</code>                                            |
| **`customData`**  | <code><a href="#record">Record</a>&lt;string, unknown&gt;</code> |


#### SeekOptions

| Prop           | Type                |
| -------------- | ------------------- |
| **`position`** | <code>number</code> |


#### SetVolumeOptions

| Prop        | Type                |
| ----------- | ------------------- |
| **`level`** | <code>number</code> |


#### SetMutedOptions

| Prop        | Type                 |
| ----------- | -------------------- |
| **`muted`** | <code>boolean</code> |


#### MediaStatusResult

| Prop              | Type                                                                                |
| ----------------- | ----------------------------------------------------------------------------------- |
| **`mediaStatus`** | <code><a href="#castmediastatussnapshot">CastMediaStatusSnapshot</a> \| null</code> |


#### DiscoveredDevicesResult

| Prop          | Type                      |
| ------------- | ------------------------- |
| **`devices`** | <code>CastDevice[]</code> |


#### CastDevice

| Prop               | Type                 | Description                                         |
| ------------------ | -------------------- | --------------------------------------------------- |
| **`deviceId`**     | <code>string</code>  | Platform-specific device identifier.                |
| **`friendlyName`** | <code>string</code>  | Human-readable device name (e.g. "Living Room TV"). |
| **`modelName`**    | <code>string</code>  | Device model name when available.                   |
| **`isConnected`**  | <code>boolean</code> | Whether this device is the one currently connected. |


#### SendMessageOptions

| Prop            | Type                                                                       | Description                                                            |
| --------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **`namespace`** | <code>string</code>                                                        | Cast message namespace (for example `urn:x-cast:com.example.channel`). |
| **`message`**   | <code>string \| <a href="#record">Record</a>&lt;string, unknown&gt;</code> | Message payload sent to the receiver.                                  |


#### NamespaceOptions

| Prop            | Type                | Description                                                            |
| --------------- | ------------------- | ---------------------------------------------------------------------- |
| **`namespace`** | <code>string</code> | Cast message namespace (for example `urn:x-cast:com.example.channel`). |


#### PluginListenerHandle

| Prop         | Type                                      |
| ------------ | ----------------------------------------- |
| **`remove`** | <code>() =&gt; Promise&lt;void&gt;</code> |


#### CastErrorEvent

| Prop          | Type                                                             | Description                                         |
| ------------- | ---------------------------------------------------------------- | --------------------------------------------------- |
| **`code`**    | <code><a href="#casterrorcode">CastErrorCode</a></code>          | Stable plugin error code.                           |
| **`message`** | <code>string</code>                                              | Human-readable error message.                       |
| **`method`**  | <code>string</code>                                              | Plugin method that emitted or propagated the error. |
| **`data`**    | <code><a href="#record">Record</a>&lt;string, unknown&gt;</code> | Optional platform-specific diagnostic payload.      |


#### MessageReceivedEvent

| Prop            | Type                                                                       | Description                                                                     |
| --------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **`namespace`** | <code>string</code>                                                        | Namespace on which the message was received.                                    |
| **`message`**   | <code>string \| <a href="#record">Record</a>&lt;string, unknown&gt;</code> | Parsed message payload when JSON object parsing succeeds, otherwise raw string. |
| **`raw`**       | <code>string</code>                                                        | Raw message string when available from the Cast SDK.                            |


#### SessionStateChangedEvent

| Prop              | Type                                                                                | Description                                          |
| ----------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **`source`**      | <code>string</code>                                                                 | Event source emitted by the underlying platform SDK. |
| **`castState`**   | <code><a href="#caststatesnapshot">CastStateSnapshot</a></code>                     | Latest cast state snapshot.                          |
| **`session`**     | <code><a href="#castsessionsnapshot">CastSessionSnapshot</a> \| null</code>         | Latest cast session snapshot, if any.                |
| **`mediaStatus`** | <code><a href="#castmediastatussnapshot">CastMediaStatusSnapshot</a> \| null</code> | Latest media status snapshot, if any.                |


### Type Aliases


#### PermissionState

<code>'prompt' | 'prompt-with-rationale' | 'granted' | 'denied'</code>


#### CastUiMode

<code>'picker' | 'nativeButton' | 'headless'</code>


#### CastStateSnapshot

Raw cast state snapshot (platform-specific shape).

<code><a href="#record">Record</a>&lt;string, unknown&gt; | null</code>


#### Record

Construct a type with a set of properties K of type T

<code>{ [P in K]: T; }</code>


#### CastSessionSnapshot

Raw session snapshot (platform-specific shape).

<code><a href="#record">Record</a>&lt;string, unknown&gt;</code>


#### CastStreamType

<code>'BUFFERED' | 'LIVE' | 'OTHER'</code>


#### CastMediaStatusSnapshot

Raw media status snapshot (platform-specific shape).

<code><a href="#record">Record</a>&lt;string, unknown&gt;</code>


#### CastErrorCode

<code>'UNSUPPORTED_PLATFORM' | 'NOT_INITIALIZED' | 'NO_ACTIVE_SESSION' | 'INVALID_ARGUMENT' | 'UI_MODE_NOT_AVAILABLE' | 'OPERATION_FAILED'</code>

</docgen-api>
