package com.strasberry.plugins.capacitorcast

import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.appcompat.app.AppCompatActivity
import androidx.mediarouter.app.MediaRouteChooserDialogFragment
import androidx.mediarouter.media.MediaRouteSelector
import androidx.mediarouter.media.MediaRouter
import com.getcapacitor.JSObject
import com.google.android.gms.cast.ApplicationMetadata
import com.google.android.gms.cast.Cast
import com.google.android.gms.cast.CastMediaControlIntent
import com.google.android.gms.cast.MediaInfo
import com.google.android.gms.cast.MediaLoadRequestData
import com.google.android.gms.cast.MediaMetadata
import com.google.android.gms.cast.MediaSeekOptions
import com.google.android.gms.cast.MediaStatus
import com.google.android.gms.cast.MediaTrack
import com.google.android.gms.cast.framework.CastContext
import com.google.android.gms.cast.framework.CastSession
import com.google.android.gms.cast.framework.CastState
import com.google.android.gms.cast.framework.OptionsProvider
import com.google.android.gms.cast.framework.SessionManager
import com.google.android.gms.cast.framework.SessionManagerListener
import com.google.android.gms.cast.framework.media.RemoteMediaClient
import com.google.android.gms.common.images.WebImage
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class CastException(val code: String, override val message: String) : Exception(message)

class Cast(
    private val appContext: android.content.Context,
    private val activityProvider: () -> AppCompatActivity?,
) : SessionManagerListener<CastSession> {
    private companion object {
        const val CAST_OPTIONS_PROVIDER_META_DATA_KEY =
            "com.google.android.gms.cast.framework.OPTIONS_PROVIDER_CLASS_NAME"
        val DEFAULT_CAST_OPTIONS_PROVIDER_CLASS_NAME: String = CastOptionsProvider::class.java.name
    }

    interface EventListener {
        fun onCastError(code: String, message: String, method: String?)

        fun onMessageReceived(namespace: String, message: Any, raw: String?)

        fun onSessionStateChanged(payload: JSObject)
        fun onDevicesChanged(devices: List<Map<String, Any?>>)
    }

    var eventListener: EventListener? = null

    var initialized: Boolean = false
        private set
    var receiverApplicationId: String = ""
        private set
    var uiMode: String = "picker"
        private set
    var autoJoinPolicy: String = "origin_scoped"
        private set

    private var castContext: CastContext? = null
    private var sessionManager: SessionManager? = null
    private val subscribedMessageNamespaces = linkedSetOf<String>()
    private val attachedMessageNamespaces = linkedSetOf<String>()
    private var attachedMessageSessionId: String? = null

    private var mediaRouter: MediaRouter? = null
    private var routerCallback: MediaRouter.Callback? = null

    private val incomingMessageCallback = Cast.MessageReceivedCallback { _, namespace, message ->
        emitMessageReceived(namespace, message)
    }

    fun initialize(
        receiverApplicationId: String?,
        uiMode: String?,
        autoJoinPolicy: String?,
    ): JSObject {
        val configuredAppId = receiverApplicationId?.trim().orEmpty()
        val appId = configuredAppId.ifEmpty { CastMediaControlIntent.DEFAULT_MEDIA_RECEIVER_APPLICATION_ID }

        this.receiverApplicationId = appId
        this.uiMode = validateUiMode(uiMode)
        this.autoJoinPolicy = autoJoinPolicy?.trim()?.lowercase().takeUnless { it.isNullOrEmpty() } ?: "origin_scoped"

        CastRuntimeConfig.receiverApplicationId = appId
        CastRuntimeConfig.autoJoinPolicy = this.autoJoinPolicy

        val configuredOptionsProvider = readManifestOptionsProviderClassName()
        validateManifestOptionsProvider(configuredOptionsProvider)

        castContext = try {
            CastContext.getSharedInstance(appContext)
        } catch (error: Exception) {
            throw CastException(
                code = "OPERATION_FAILED",
                message = buildCastContextInitializationMessage(error, configuredOptionsProvider),
            )
        }

        sessionManager = castContext?.sessionManager
        sessionManager?.removeSessionManagerListener(this, CastSession::class.java)
        sessionManager?.addSessionManagerListener(this, CastSession::class.java)

        attachDeviceDiscovery(appId)

        initialized = true
        attachMessageCallbacksIfNeeded()

        return JSObject().apply {
            put("isSupported", true)
            put("uiMode", this@Cast.uiMode)
            put("receiverApplicationId", this@Cast.receiverApplicationId)
        }
    }

    fun isInitialized(): JSObject {
        return JSObject().apply {
            put("isInitialized", initialized)
        }
    }

    fun checkPermissions(): JSObject {
        return JSObject().apply {
            put("localNetwork", "granted")
        }
    }

    fun requestPermissions(): JSObject {
        return checkPermissions()
    }

    fun getCapabilities(): JSObject {
        ensureInitialized()

        return JSObject().apply {
            put("isSupported", true)
            put("canRequestSession", true)
            put("canShowDevicePicker", uiMode == "picker")
            put("supportsMediaControl", true)
            put("supportsVolumeControl", true)
            put("supportsCustomChannels", true)
        }
    }

    fun getCastState(): JSObject {
        ensureInitialized()
        val state = castContext?.castState ?: CastState.NO_DEVICES_AVAILABLE
        return JSObject().apply {
            put("rawValue", state)
        }
    }

    fun getSession(): JSObject? {
        ensureInitialized()
        return snapshotSession(sessionManager?.currentCastSession)
    }

    fun getMediaStatus(): JSObject? {
        ensureInitialized()
        return snapshotMediaStatus(sessionManager?.currentCastSession?.remoteMediaClient?.mediaStatus)
    }

    fun requestSession() {
        ensureInitialized()

        if (uiMode == "nativeButton") {
            throw CastException(
                code = "UI_MODE_NOT_AVAILABLE",
                message = "requestSession is unavailable when uiMode is nativeButton",
            )
        }

        if (uiMode == "headless") {
            if (sessionManager?.currentCastSession != null) {
                return
            }

            throw CastException(
                code = "UI_MODE_NOT_AVAILABLE",
                message = "requestSession cannot open picker when uiMode is headless",
            )
        }

        if (!showRouteChooserDialog()) {
            throw CastException(
                code = "OPERATION_FAILED",
                message = "Unable to present cast device picker",
            )
        }
    }

    fun showDevicePicker() {
        ensureInitialized()

        if (uiMode != "picker") {
            throw CastException(
                code = "UI_MODE_NOT_AVAILABLE",
                message = "showDevicePicker is unavailable when uiMode is $uiMode",
            )
        }

        if (!showRouteChooserDialog()) {
            throw CastException(
                code = "OPERATION_FAILED",
                message = "Unable to present cast device picker",
            )
        }
    }

    fun connectToDevice(deviceId: String?) {
        ensureInitialized()

        val resolvedDeviceId = deviceId?.trim().orEmpty()
        if (resolvedDeviceId.isEmpty()) {
            throw CastException(
                code = "INVALID_ARGUMENT",
                message = "connectToDevice requires a non-empty deviceId",
            )
        }

        val selector = buildRouteSelector()
            ?: throw CastException(
                code = "OPERATION_FAILED",
                message = "Unable to resolve cast route selector",
            )

        val router = mediaRouter ?: MediaRouter.getInstance(appContext).also { mediaRouter = it }
        val route = (router.routes ?: emptyList())
            .firstOrNull { candidate ->
                candidate.id == resolvedDeviceId &&
                    candidate.matchesSelector(selector) &&
                    !candidate.isDefault &&
                    candidate.isEnabled
            }
            ?: throw CastException(
                code = "INVALID_ARGUMENT",
                message = "Unknown cast device: $resolvedDeviceId",
            )

        router.selectRoute(route)
        emitDevicesChanged()
    }

    fun endSession(stopCasting: Boolean): Boolean {
        ensureInitialized()

        val manager = sessionManager ?: throw CastException(
            code = "OPERATION_FAILED",
            message = "SessionManager unavailable",
        )

        if (manager.currentSession == null) {
            return false
        }

        manager.endCurrentSession(stopCasting)
        return true
    }

    fun loadMedia(request: JSObject): JSObject {
        ensureInitialized()

        val castSession = requireCastSession()
        val mediaClient = castSession.remoteMediaClient
            ?: throw CastException(code = "OPERATION_FAILED", message = "No active media session")

        val url = request.getString("url")?.trim().orEmpty()
        val contentType = request.getString("contentType")?.trim().orEmpty()

        if (url.isEmpty() || contentType.isEmpty()) {
            throw CastException(code = "INVALID_ARGUMENT", message = "loadMedia requires url and contentType")
        }

        val mediaInfoBuilder = MediaInfo.Builder(url)
            .setContentType(contentType)
            .setStreamType(mapStreamType(request.getString("streamType")))

        request.optJSONObject("customData")?.let { mediaInfoBuilder.setCustomData(it) }
        buildMetadata(request)?.let { mediaInfoBuilder.setMetadata(it) }
        parseTracks(request.optJSONArray("tracks"))?.let { mediaInfoBuilder.setMediaTracks(it) }

        val loadRequestBuilder = MediaLoadRequestData.Builder()
            .setMediaInfo(mediaInfoBuilder.build())

        request.getBool("autoplay")?.let { loadRequestBuilder.setAutoplay(it) }
        request.optDouble("currentTime").takeIf { !it.isNaN() }?.let {
            loadRequestBuilder.setCurrentTime((it.coerceAtLeast(0.0) * 1000).toLong())
        }
        request.optJSONObject("customData")?.let { loadRequestBuilder.setCustomData(it) }

        parseActiveTrackIds(request.optJSONArray("activeTrackIds"))?.let {
            loadRequestBuilder.setActiveTrackIds(it)
        }

        mediaClient.load(loadRequestBuilder.build())

        return JSObject().apply {
            put("requestId", java.util.UUID.randomUUID().toString())
        }
    }

    fun play(onSuccess: () -> Unit, onFailure: (String) -> Unit) {
        ensureInitialized()
        requireRemoteMediaClient().play().setResultCallback { result ->
            if (result.status.isSuccess) onSuccess()
            else onFailure(result.status.statusMessage ?: "play failed")
        }
    }

    fun pause(onSuccess: () -> Unit, onFailure: (String) -> Unit) {
        ensureInitialized()
        requireRemoteMediaClient().pause().setResultCallback { result ->
            if (result.status.isSuccess) onSuccess()
            else onFailure(result.status.statusMessage ?: "pause failed")
        }
    }

    fun stop(onSuccess: () -> Unit, onFailure: (String) -> Unit) {
        ensureInitialized()
        requireRemoteMediaClient().stop().setResultCallback { result ->
            if (result.status.isSuccess) onSuccess()
            else onFailure(result.status.statusMessage ?: "stop failed")
        }
    }

    fun seek(position: Double, onSuccess: () -> Unit, onFailure: (String) -> Unit) {
        ensureInitialized()

        if (!position.isFinite() || position < 0) {
            throw CastException(code = "INVALID_ARGUMENT", message = "seek position must be a number >= 0")
        }

        val options = MediaSeekOptions.Builder()
            .setPosition((position * 1000).toLong())
            .build()

        requireRemoteMediaClient().seek(options).setResultCallback { result ->
            if (result.status.isSuccess) onSuccess()
            else onFailure(result.status.statusMessage ?: "seek failed")
        }
    }

    fun setVolume(level: Double) {
        ensureInitialized()

        if (!level.isFinite() || level < 0 || level > 1) {
            throw CastException(code = "INVALID_ARGUMENT", message = "setVolume level must be in range [0, 1]")
        }

        try {
            requireCastSession().setVolume(level)
        } catch (_: Exception) {
            throw CastException(code = "OPERATION_FAILED", message = "Failed to set cast volume")
        }
    }

    fun setMuted(muted: Boolean) {
        ensureInitialized()

        try {
            requireCastSession().setMute(muted)
        } catch (_: Exception) {
            throw CastException(code = "OPERATION_FAILED", message = "Failed to set cast mute")
        }
    }

    fun sendMessage(namespace: String?, message: Any?) {
        ensureInitialized()

        val resolvedNamespace = normalizeNamespace(namespace)
            ?: throw CastException(code = "INVALID_ARGUMENT", message = "sendMessage requires a non-empty namespace")
        val payload = serializeOutgoingMessage(message)
        val castSession = requireCastSession()

        try {
            val result = castSession.sendMessage(resolvedNamespace, payload)
            val status = result.await(10, TimeUnit.SECONDS)
            if (!status.isSuccess) {
                throw CastException(
                    code = "OPERATION_FAILED",
                    message = status.statusMessage ?: "Failed to send custom cast message",
                )
            }
        } catch (error: CastException) {
            throw error
        } catch (_: Exception) {
            throw CastException(code = "OPERATION_FAILED", message = "Failed to send custom cast message")
        }
    }

    fun subscribeNamespace(namespace: String?) {
        ensureInitialized()

        val resolvedNamespace = normalizeNamespace(namespace)
            ?: throw CastException(
                code = "INVALID_ARGUMENT",
                message = "subscribeNamespace requires a non-empty namespace",
            )

        subscribedMessageNamespaces += resolvedNamespace
        attachMessageCallbacksIfNeeded()
    }

    fun unsubscribeNamespace(namespace: String?) {
        ensureInitialized()

        val resolvedNamespace = normalizeNamespace(namespace)
            ?: throw CastException(
                code = "INVALID_ARGUMENT",
                message = "unsubscribeNamespace requires a non-empty namespace",
            )

        subscribedMessageNamespaces -= resolvedNamespace

        val targetSession = sessionManager?.currentCastSession
        if (targetSession != null && attachedMessageNamespaces.contains(resolvedNamespace)) {
            try {
                targetSession.removeMessageReceivedCallbacks(resolvedNamespace)
            } catch (_: Exception) {
                // Best effort cleanup.
            }
            attachedMessageNamespaces -= resolvedNamespace
        }
    }

    fun getDiscoveredDevices(): List<Map<String, Any?>> {
        ensureInitialized()
        val selector = buildRouteSelector() ?: return emptyList()
        val connectedDeviceId = sessionManager?.currentCastSession?.castDevice?.deviceId
        return (mediaRouter?.routes ?: emptyList())
            .filter { route -> route.matchesSelector(selector) && !route.isDefault && route.isEnabled }
            .map { route ->
                mapOf(
                    "deviceId" to route.id,
                    "friendlyName" to route.name,
                    "modelName" to route.description,
                    "isConnected" to (route.id == connectedDeviceId),
                )
            }
    }

    fun rescanDevices(): List<Map<String, Any?>> {
        ensureInitialized()
        val appId = receiverApplicationId.ifBlank {
            throw CastException(code = "OPERATION_FAILED", message = "Receiver application id is not configured")
        }

        attachDeviceDiscovery(appId)
        val devices = getDiscoveredDevices()
        eventListener?.onDevicesChanged(devices)
        return devices
    }

    fun openSettings() {
        val activity = activityProvider() ?: return
        val intent = Intent(
            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.fromParts("package", activity.packageName, null),
        )
        activity.startActivity(intent)
    }

    fun release() {
        routerCallback?.let { mediaRouter?.removeCallback(it) }
        routerCallback = null
        mediaRouter = null
        detachMessageCallbacks(sessionManager?.currentCastSession)
        sessionManager?.removeSessionManagerListener(this, CastSession::class.java)
    }

    private fun attachDeviceDiscovery(appId: String) {
        routerCallback?.let { mediaRouter?.removeCallback(it) }
        val router = MediaRouter.getInstance(appContext)
        mediaRouter = router
        val selector = MediaRouteSelector.Builder()
            .addControlCategory(CastMediaControlIntent.categoryForCast(appId))
            .build()
        val cb = object : MediaRouter.Callback() {
            override fun onRouteAdded(router: MediaRouter, route: MediaRouter.RouteInfo) { emitDevicesChanged() }
            override fun onRouteRemoved(router: MediaRouter, route: MediaRouter.RouteInfo) { emitDevicesChanged() }
            override fun onRouteChanged(router: MediaRouter, route: MediaRouter.RouteInfo) { emitDevicesChanged() }
        }
        routerCallback = cb
        router.addCallback(selector, cb, MediaRouter.CALLBACK_FLAG_REQUEST_DISCOVERY)
    }

    private fun buildRouteSelector(): MediaRouteSelector? {
        val appId = receiverApplicationId.ifBlank { return null }
        return MediaRouteSelector.Builder()
            .addControlCategory(CastMediaControlIntent.categoryForCast(appId))
            .build()
    }

    private fun emitDevicesChanged() {
        val devices = runCatching { getDiscoveredDevices() }.getOrElse { emptyList() }
        eventListener?.onDevicesChanged(devices)
    }

    override fun onSessionStarting(session: CastSession) {
        // no-op
    }

    override fun onSessionStarted(session: CastSession, sessionId: String) {
        attachMessageCallbacksIfNeeded()
        emitSessionStateChanged("SESSION_STARTED")
    }

    override fun onSessionStartFailed(session: CastSession, error: Int) {
        detachMessageCallbacks(session)
        eventListener?.onCastError("OPERATION_FAILED", "Session start failed: $error", "SessionManager.onSessionStartFailed")
        emitSessionStateChanged("SESSION_START_FAILED")
    }

    override fun onSessionEnding(session: CastSession) {
        // no-op
    }

    override fun onSessionEnded(session: CastSession, error: Int) {
        if (error != 0) {
            eventListener?.onCastError("OPERATION_FAILED", "Session ended with code: $error", "SessionManager.onSessionEnded")
        }

        detachMessageCallbacks(session)
        emitSessionStateChanged("SESSION_ENDED")
    }

    override fun onSessionResuming(session: CastSession, sessionId: String) {
        // no-op
    }

    override fun onSessionResumed(session: CastSession, wasSuspended: Boolean) {
        attachMessageCallbacksIfNeeded()
        emitSessionStateChanged("SESSION_RESUMED")
    }

    override fun onSessionResumeFailed(session: CastSession, error: Int) {
        detachMessageCallbacks(session)
        eventListener?.onCastError("OPERATION_FAILED", "Session resume failed: $error", "SessionManager.onSessionResumeFailed")
        emitSessionStateChanged("SESSION_RESUME_FAILED")
    }

    override fun onSessionSuspended(session: CastSession, reason: Int) {
        emitSessionStateChanged("SESSION_SUSPENDED")
    }

    private fun showRouteChooserDialog(): Boolean {
        val hostActivity = activityProvider() ?: return false
        val selector = castContext?.mergedSelector ?: return false

        hostActivity.runOnUiThread {
            val dialogTag = "capacitor_cast_route_chooser"
            val existing = hostActivity.supportFragmentManager.findFragmentByTag(dialogTag)
            if (existing != null) {
                return@runOnUiThread
            }

            val chooserDialog = MediaRouteChooserDialogFragment()
            chooserDialog.routeSelector = selector
            chooserDialog.show(hostActivity.supportFragmentManager, dialogTag)
        }

        return true
    }

    private fun ensureInitialized() {
        if (!initialized) {
            throw CastException(code = "NOT_INITIALIZED", message = "Call initialize() before using cast APIs")
        }
    }

    private fun normalizeNamespace(namespace: String?): String? {
        val trimmed = namespace?.trim().orEmpty()
        return trimmed.takeIf { it.isNotEmpty() }
    }

    private fun serializeOutgoingMessage(message: Any?): String {
        if (message == null || message == JSONObject.NULL) {
            throw CastException(code = "INVALID_ARGUMENT", message = "sendMessage.message is required")
        }

        return when (message) {
            is String -> message
            is JSONObject -> message.toString()
            is Map<*, *> -> {
                if (message.keys.any { it !is String }) {
                    throw CastException(code = "INVALID_ARGUMENT", message = "sendMessage.message object keys must be strings")
                }

                try {
                    JSONObject(message).toString()
                } catch (_: Exception) {
                    throw CastException(code = "INVALID_ARGUMENT", message = "sendMessage.message must be JSON serializable")
                }
            }
            else -> throw CastException(code = "INVALID_ARGUMENT", message = "sendMessage.message must be a string or object")
        }
    }

    private fun attachMessageCallbacksIfNeeded() {
        val session = sessionManager?.currentCastSession ?: run {
            detachMessageCallbacks(null)
            return
        }

        if (attachedMessageSessionId != session.sessionId) {
            attachedMessageSessionId = session.sessionId
            attachedMessageNamespaces.clear()
        }

        for (namespace in subscribedMessageNamespaces) {
            if (attachedMessageNamespaces.contains(namespace)) {
                continue
            }

            try {
                session.setMessageReceivedCallbacks(namespace, incomingMessageCallback)
                attachedMessageNamespaces += namespace
            } catch (error: Exception) {
                eventListener?.onCastError(
                    "OPERATION_FAILED",
                    error.message ?: "Failed to attach message callback",
                    "CastSession.setMessageReceivedCallbacks",
                )
            }
        }

        for (namespace in attachedMessageNamespaces.toList()) {
            if (subscribedMessageNamespaces.contains(namespace)) {
                continue
            }

            try {
                session.removeMessageReceivedCallbacks(namespace)
            } catch (_: Exception) {
                // Best effort cleanup.
            }
            attachedMessageNamespaces -= namespace
        }
    }

    private fun detachMessageCallbacks(session: CastSession?) {
        val targetSession = session ?: sessionManager?.currentCastSession
        if (targetSession != null) {
            for (namespace in attachedMessageNamespaces) {
                try {
                    targetSession.removeMessageReceivedCallbacks(namespace)
                } catch (_: Exception) {
                    // Best effort cleanup.
                }
            }
        }

        attachedMessageNamespaces.clear()
        attachedMessageSessionId = null
    }

    private fun emitMessageReceived(namespace: String, rawMessage: String) {
        val parsed = runCatching { JSONObject(rawMessage) }.getOrNull()
        if (parsed != null) {
            eventListener?.onMessageReceived(namespace, parsed, rawMessage)
            return
        }

        eventListener?.onMessageReceived(namespace, rawMessage, rawMessage)
    }

    private fun emitSessionStateChanged(source: String) {
        val currentSession = sessionManager?.currentCastSession
        val castStateSnapshot = JSObject().apply {
            put("rawValue", castContext?.castState ?: CastState.NO_DEVICES_AVAILABLE)
        }

        val payload = JSObject().apply {
            put("source", source)
            put("castState", castStateSnapshot)
            put("session", snapshotSession(currentSession) ?: JSONObject.NULL)
            put("mediaStatus", snapshotMediaStatus(currentSession?.remoteMediaClient?.mediaStatus) ?: JSONObject.NULL)
        }

        eventListener?.onSessionStateChanged(payload)
    }

    private fun requireCastSession(): CastSession {
        return sessionManager?.currentCastSession
            ?: throw CastException(code = "NO_ACTIVE_SESSION", message = "No active cast session")
    }

    private fun requireRemoteMediaClient(): RemoteMediaClient {
        val client = sessionManager?.currentCastSession?.remoteMediaClient
            ?: throw CastException(code = "OPERATION_FAILED", message = "No active media session")

        if (!client.hasMediaSession()) {
            throw CastException(code = "OPERATION_FAILED", message = "No active media session")
        }

        return client
    }

    private fun snapshotSession(session: CastSession?): JSObject? {
        if (session == null) {
            return null
        }

        val namespaces = JSONArray()
        val applicationMetadata: ApplicationMetadata? = session.applicationMetadata
        applicationMetadata?.supportedNamespaces?.forEach { namespace ->
            namespaces.put(namespace)
        }

        return JSObject().apply {
            put("sessionId", session.sessionId)
            put("applicationStatus", session.applicationStatus)
            put("receiverApplicationId", applicationMetadata?.applicationId)
            put("receiverFriendlyName", session.castDevice?.friendlyName)
            put("supportedNamespaces", namespaces)
        }
    }

    private fun snapshotMediaStatus(status: MediaStatus?): JSObject? {
        if (status == null) {
            return null
        }

        val statusJson = status.toJson()
        return jsonObjectToJsObject(statusJson)
    }

    private fun jsonObjectToJsObject(source: JSONObject): JSObject {
        val target = JSObject()
        val iterator = source.keys()
        while (iterator.hasNext()) {
            val key = iterator.next()
            target.put(key, source.opt(key))
        }
        return target
    }

    private fun mapStreamType(value: String?): Int {
        return when (value) {
            "LIVE" -> MediaInfo.STREAM_TYPE_LIVE
            "OTHER" -> MediaInfo.STREAM_TYPE_NONE
            else -> MediaInfo.STREAM_TYPE_BUFFERED
        }
    }

    private fun buildMetadata(request: JSObject): MediaMetadata? {
        val metadataPayload = request.optJSONObject("metadata")
        val title = request.getString("title") ?: metadataPayload?.optString("title")
        val subtitle = request.getString("subtitle") ?: metadataPayload?.optString("subtitle")

        val metadata = MediaMetadata(MediaMetadata.MEDIA_TYPE_GENERIC)

        if (!title.isNullOrBlank()) {
            metadata.putString(MediaMetadata.KEY_TITLE, title)
        }

        if (!subtitle.isNullOrBlank()) {
            metadata.putString(MediaMetadata.KEY_SUBTITLE, subtitle)
        }

        metadataPayload?.optString("studio")?.takeIf { it.isNotBlank() }?.let {
            metadata.putString(MediaMetadata.KEY_STUDIO, it)
        }

        metadataPayload?.optString("releaseDate")?.takeIf { it.isNotBlank() }?.let {
            metadata.putString(MediaMetadata.KEY_RELEASE_DATE, it)
        }

        val imageUrls = mutableListOf<String>()
        request.getString("posterUrl")?.takeIf { it.isNotBlank() }?.let { imageUrls += it }

        val extraImages = metadataPayload?.optJSONArray("images")
        if (extraImages != null) {
            for (index in 0 until extraImages.length()) {
                val url = extraImages.optString(index)
                if (url.isNotBlank()) {
                    imageUrls += url
                }
            }
        }

        imageUrls.forEach { url ->
            runCatching { WebImage(android.net.Uri.parse(url)) }
                .onSuccess { metadata.addImage(it) }
        }

        if (metadata.keySet().isEmpty() && !metadata.hasImages()) {
            return null
        }

        return metadata
    }

    private fun parseTracks(tracksArray: JSONArray?): List<MediaTrack>? {
        if (tracksArray == null || tracksArray.length() == 0) {
            return null
        }

        val tracks = mutableListOf<MediaTrack>()

        for (index in 0 until tracksArray.length()) {
            val trackObject = tracksArray.optJSONObject(index) ?: continue

            val trackId = trackObject.optLong("trackId", -1)
            val type = mapTrackType(trackObject.optString("type")) ?: continue

            val builder = MediaTrack.Builder(trackId, type)

            trackObject.optString("contentId").takeIf { it.isNotBlank() }?.let { builder.setContentId(it) }
            trackObject.optString("contentType").takeIf { it.isNotBlank() }?.let { builder.setContentType(it) }
            trackObject.optString("name").takeIf { it.isNotBlank() }?.let { builder.setName(it) }
            trackObject.optString("language").takeIf { it.isNotBlank() }?.let { builder.setLanguage(it) }
            mapTrackSubtype(trackObject.optString("subtype"))?.let { builder.setSubtype(it) }
            trackObject.optJSONObject("customData")?.let { builder.setCustomData(it) }

            tracks += builder.build()
        }

        return tracks.takeIf { it.isNotEmpty() }
    }

    private fun parseActiveTrackIds(activeTrackIds: JSONArray?): LongArray? {
        if (activeTrackIds == null || activeTrackIds.length() == 0) {
            return null
        }

        return LongArray(activeTrackIds.length()) { index ->
            activeTrackIds.optLong(index)
        }
    }

    private fun mapTrackType(type: String?): Int? {
        return when (type) {
            "TEXT" -> MediaTrack.TYPE_TEXT
            "AUDIO" -> MediaTrack.TYPE_AUDIO
            "VIDEO" -> MediaTrack.TYPE_VIDEO
            else -> null
        }
    }

    private fun mapTrackSubtype(subtype: String?): Int? {
        return when (subtype) {
            "SUBTITLES" -> MediaTrack.SUBTYPE_SUBTITLES
            "CAPTIONS" -> MediaTrack.SUBTYPE_CAPTIONS
            "DESCRIPTIONS" -> MediaTrack.SUBTYPE_DESCRIPTIONS
            "CHAPTERS" -> MediaTrack.SUBTYPE_CHAPTERS
            "METADATA" -> MediaTrack.SUBTYPE_METADATA
            else -> null
        }
    }

    private fun validateUiMode(value: String?): String {
        return when (value) {
            "picker" -> "picker"
            "nativeButton" -> "nativeButton"
            "headless" -> "headless"
            else -> "picker"
        }
    }

    private fun readManifestOptionsProviderClassName(): String? {
        return try {
            val appInfo = appContext.packageManager.getApplicationInfo(
                appContext.packageName,
                PackageManager.GET_META_DATA,
            )

            appInfo.metaData
                ?.getString(CAST_OPTIONS_PROVIDER_META_DATA_KEY)
                ?.trim()
                ?.takeIf { it.isNotEmpty() }
        } catch (_: Exception) {
            null
        }
    }

    private fun validateManifestOptionsProvider(className: String?) {
        val normalizedClassName = className?.trim().orEmpty()
        if (normalizedClassName.isEmpty()) {
            throw CastException(
                code = "OPERATION_FAILED",
                message = "Missing manifest meta-data `$CAST_OPTIONS_PROVIDER_META_DATA_KEY` under `<application>`; set it to `$DEFAULT_CAST_OPTIONS_PROVIDER_CLASS_NAME`.",
            )
        }

        val providerClass = try {
            Class.forName(normalizedClassName, false, appContext.classLoader)
        } catch (_: ClassNotFoundException) {
            throw CastException(
                code = "OPERATION_FAILED",
                message = "Manifest meta-data `$CAST_OPTIONS_PROVIDER_META_DATA_KEY` points to `$normalizedClassName`, but this class is not found at runtime.",
            )
        } catch (_: Exception) {
            throw CastException(
                code = "OPERATION_FAILED",
                message = "Unable to load cast options provider class `$normalizedClassName` from manifest meta-data `$CAST_OPTIONS_PROVIDER_META_DATA_KEY`.",
            )
        }

        if (!OptionsProvider::class.java.isAssignableFrom(providerClass)) {
            throw CastException(
                code = "OPERATION_FAILED",
                message = "Manifest meta-data `$CAST_OPTIONS_PROVIDER_META_DATA_KEY` points to `$normalizedClassName`, but it does not implement `OptionsProvider`.",
            )
        }
    }

    private fun buildCastContextInitializationMessage(error: Exception, providerClassName: String?): String {
        val providerHint = providerClassName?.takeIf { it.isNotBlank() } ?: "<missing>"
        val cause = error.message?.takeIf { it.isNotBlank() } ?: error.javaClass.simpleName

        return "Failed to initialize CastContext (cause: $cause). Manifest `$CAST_OPTIONS_PROVIDER_META_DATA_KEY` = `$providerHint`."
    }
}
