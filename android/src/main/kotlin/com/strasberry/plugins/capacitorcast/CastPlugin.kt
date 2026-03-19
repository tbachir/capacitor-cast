package com.strasberry.plugins.capacitorcast

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONObject

@CapacitorPlugin(name = "Cast")
class CastPlugin : Plugin() {

    private lateinit var implementation: Cast
    private var autoInitializeAttempted = false

    override fun load() {
        super.load()

        implementation = Cast(context) { activity }
        implementation.eventListener = object : Cast.EventListener {
            override fun onCastError(code: String, message: String, method: String?) {
                notifyListeners(
                    "castError",
                    JSObject().apply {
                        put("code", code)
                        put("message", message)
                        if (method != null) {
                            put("method", method)
                        }
                    },
                )
            }

            override fun onMessageReceived(namespace: String, message: Any, raw: String?) {
                notifyListeners(
                    "messageReceived",
                    JSObject().apply {
                        put("namespace", namespace)
                        put("message", message)
                        if (raw != null) {
                            put("raw", raw)
                        }
                    },
                )
            }

            override fun onSessionStateChanged(payload: JSObject) {
                notifyListeners("sessionStateChanged", payload)
            }

            override fun onDevicesChanged(devices: List<Map<String, Any?>>) {
                val arr = org.json.JSONArray()
                devices.forEach { device ->
                    val obj = JSObject()
                    device.forEach { (k, v) -> if (v != null) obj.put(k, v) }
                    arr.put(obj)
                }
                notifyListeners("devicesChanged", JSObject().apply { put("devices", arr) })
            }
        }

        autoInitializeOnLoad()
    }

    override fun handleOnDestroy() {
        implementation.release()
        super.handleOnDestroy()
    }

    @PluginMethod
    fun initialize(call: PluginCall) {
        runOnMainThread(call, "initialize") {
            val receiverApplicationId =
                getConfig().getString("receiverApplicationId")
                    ?: getConfig().getString("receiverAppId")

            val payload = implementation.initialize(
                receiverApplicationId,
                getConfig().getString("uiMode", "picker"),
                getConfig().getString("autoJoinPolicy", "origin_scoped"),
            )

            call.resolve(payload)
        }
    }

    @PluginMethod
    fun isInitialized(call: PluginCall) {
        runOnMainThread(call, "isInitialized") {
            call.resolve(implementation.isInitialized())
        }
    }

    @PluginMethod
    override fun checkPermissions(call: PluginCall) {
        runOnMainThread(call, "checkPermissions") {
            call.resolve(implementation.checkPermissions())
        }
    }

    @PluginMethod
    override fun requestPermissions(call: PluginCall) {
        runOnMainThread(call, "requestPermissions") {
            call.resolve(implementation.requestPermissions())
        }
    }

    @PluginMethod
    fun getCapabilities(call: PluginCall) {
        runOnMainThread(call, "getCapabilities") {
            call.resolve(implementation.getCapabilities())
        }
    }

    @PluginMethod
    fun getCastState(call: PluginCall) {
        runOnMainThread(call, "getCastState") {
            call.resolve(
                JSObject().apply {
                    put("castState", implementation.getCastState())
                },
            )
        }
    }

    @PluginMethod
    fun getSession(call: PluginCall) {
        runOnMainThread(call, "getSession") {
            call.resolve(
                JSObject().apply {
                    put("session", implementation.getSession() ?: JSONObject.NULL)
                },
            )
        }
    }

    @PluginMethod
    fun requestSession(call: PluginCall) {
        runOnMainThread(call, "requestSession") {
            implementation.requestSession()
            call.resolve()
        }
    }

    @PluginMethod
    fun showDevicePicker(call: PluginCall) {
        runOnMainThread(call, "showDevicePicker") {
            implementation.showDevicePicker()
            call.resolve()
        }
    }

    @PluginMethod
    fun endSession(call: PluginCall) {
        runOnMainThread(call, "endSession") {
            val stopCasting = call.getBoolean("stopCasting") ?: true
            implementation.endSession(stopCasting)
            call.resolve()
        }
    }

    @PluginMethod
    fun loadMedia(call: PluginCall) {
        runOnMainThread(call, "loadMedia") {
            val result = implementation.loadMedia(call.data)
            call.resolve(result)
        }
    }

    @PluginMethod
    fun play(call: PluginCall) {
        runOnMainThread(call, "play") {
            implementation.play(
                onSuccess = { call.resolve() },
                onFailure = { msg -> call.reject(msg, "OPERATION_FAILED") },
            )
        }
    }

    @PluginMethod
    fun pause(call: PluginCall) {
        runOnMainThread(call, "pause") {
            implementation.pause(
                onSuccess = { call.resolve() },
                onFailure = { msg -> call.reject(msg, "OPERATION_FAILED") },
            )
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        runOnMainThread(call, "stop") {
            implementation.stop(
                onSuccess = { call.resolve() },
                onFailure = { msg -> call.reject(msg, "OPERATION_FAILED") },
            )
        }
    }

    @PluginMethod
    fun seek(call: PluginCall) {
        runOnMainThread(call, "seek") {
            val position = call.getDouble("position")
                ?: throw CastException("INVALID_ARGUMENT", "seek position must be a number >= 0")

            implementation.seek(
                position,
                onSuccess = { call.resolve() },
                onFailure = { msg -> call.reject(msg, "OPERATION_FAILED") },
            )
        }
    }

    @PluginMethod
    fun setVolume(call: PluginCall) {
        runOnMainThread(call, "setVolume") {
            val level = call.getDouble("level")
            if (level == null) {
                throw CastException("INVALID_ARGUMENT", "setVolume level must be in range [0, 1]")
            }

            implementation.setVolume(level)
            call.resolve()
        }
    }

    @PluginMethod
    fun setMuted(call: PluginCall) {
        runOnMainThread(call, "setMuted") {
            val muted = call.getBoolean("muted")
            if (muted == null) {
                throw CastException("INVALID_ARGUMENT", "setMuted requires a boolean muted value")
            }

            implementation.setMuted(muted)
            call.resolve()
        }
    }

    @PluginMethod
    fun getMediaStatus(call: PluginCall) {
        runOnMainThread(call, "getMediaStatus") {
            call.resolve(
                JSObject().apply {
                    put("mediaStatus", implementation.getMediaStatus() ?: JSONObject.NULL)
                },
            )
        }
    }

    @PluginMethod
    fun getDiscoveredDevices(call: PluginCall) {
        runOnMainThread(call, "getDiscoveredDevices") {
            val devices = implementation.getDiscoveredDevices()
            val arr = org.json.JSONArray()
            devices.forEach { device ->
                val obj = JSObject()
                device.forEach { (k, v) -> if (v != null) obj.put(k, v) }
                arr.put(obj)
            }
            call.resolve(JSObject().apply { put("devices", arr) })
        }
    }

    @PluginMethod
    fun openSettings(call: PluginCall) {
        runOnMainThread(call, "openSettings") {
            implementation.openSettings()
            call.resolve()
        }
    }

    @PluginMethod
    fun sendMessage(call: PluginCall) {
        runOnMainThread(call, "sendMessage") {
            implementation.sendMessage(
                call.getString("namespace"),
                call.data.opt("message"),
            )
            call.resolve()
        }
    }

    @PluginMethod
    fun subscribeNamespace(call: PluginCall) {
        runOnMainThread(call, "subscribeNamespace") {
            implementation.subscribeNamespace(call.getString("namespace"))
            call.resolve()
        }
    }

    @PluginMethod
    fun unsubscribeNamespace(call: PluginCall) {
        runOnMainThread(call, "unsubscribeNamespace") {
            implementation.unsubscribeNamespace(call.getString("namespace"))
            call.resolve()
        }
    }

    private fun runOnMainThread(call: PluginCall, method: String, action: () -> Unit) {
        bridge.executeOnMainThread {
            try {
                action()
            } catch (error: Exception) {
                reject(call, method, error)
            }
        }
    }

    private fun autoInitializeOnLoad() {
        if (autoInitializeAttempted) {
            return
        }
        autoInitializeAttempted = true

        if (!getConfig().getBoolean("autoInitialize", true)) return

        bridge.executeOnMainThread {
            try {
                val receiverApplicationId =
                    getConfig().getString("receiverApplicationId")
                        ?: getConfig().getString("receiverAppId")

                implementation.initialize(
                    receiverApplicationId,
                    getConfig().getString("uiMode", "picker"),
                    getConfig().getString("autoJoinPolicy", "origin_scoped"),
                )
            } catch (error: Exception) {
                emitCastError(method = "initialize", error = error)
            }
        }
    }

    private fun reject(call: PluginCall, method: String, error: Exception) {
        val emittedCode = emitCastError(method = method, error = error)
        if (error is CastException) {
            call.reject(error.message, emittedCode)
            return
        }

        call.reject(error.message ?: "Cast operation failed", "OPERATION_FAILED", error)
    }

    private fun emitCastError(method: String, error: Exception): String {
        if (error is CastException) {
            notifyListeners(
                "castError",
                JSObject().apply {
                    put("code", error.code)
                    put("message", error.message)
                    put("method", method)
                },
            )
            return error.code
        }

        notifyListeners(
            "castError",
            JSObject().apply {
                put("code", "OPERATION_FAILED")
                put("message", error.message)
                put("method", method)
            },
        )
        return "OPERATION_FAILED"
    }
}
