import Foundation
import Capacitor

@objc(CastPlugin)
public class CastPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CastPlugin"
    public let jsName = "Cast"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isInitialized", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "initialize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getCapabilities", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getCastState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showDevicePicker", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "loadMedia", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "seek", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setVolume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setMuted", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getMediaStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getDiscoveredDevices", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sendMessage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "subscribeNamespace", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unsubscribeNamespace", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "addListener", returnType: CAPPluginReturnCallback),
        CAPPluginMethod(name: "removeListener", returnType: CAPPluginReturnNone),
        CAPPluginMethod(name: "removeAllListeners", returnType: CAPPluginReturnPromise),
    ]

    private let implementation = Cast()
    private var autoInitializeAttempted = false

    public override func load() {
        super.load()
        bindImplementationEvents()
        autoInitializeOnLoad()
    }

    @objc func isInitialized(_ call: CAPPluginCall) {
        call.resolve(implementation.isInitialized())
    }

    @objc override public func checkPermissions(_ call: CAPPluginCall) {
        implementation.checkPermissions { payload in
            DispatchQueue.main.async {
                call.resolve(payload)
            }
        }
    }

    @objc override public func requestPermissions(_ call: CAPPluginCall) {
        implementation.requestPermissions { payload in
            DispatchQueue.main.async {
                call.resolve(payload)
            }
        }
    }

    @objc func initialize(_ call: CAPPluginCall) {
        do {
            let receiverApplicationId = getConfig().getString("receiverApplicationId")
                ?? getConfig().getString("receiverAppId")
            let uiMode = getConfig().getString("uiMode", "picker")
            let autoJoinPolicy = getConfig().getString("autoJoinPolicy", "origin_scoped")

            let payload = try implementation.initialize(
                receiverApplicationId: receiverApplicationId,
                uiMode: uiMode,
                autoJoinPolicy: autoJoinPolicy
            )

            call.resolve(payload)
        } catch {
            reject(call, method: "initialize", error: error)
        }
    }

    @objc func getCapabilities(_ call: CAPPluginCall) {
        do {
            call.resolve(try implementation.getCapabilities())
        } catch {
            reject(call, method: "getCapabilities", error: error)
        }
    }

    @objc func getCastState(_ call: CAPPluginCall) {
        do {
            call.resolve(["castState": try implementation.getCastState()])
        } catch {
            reject(call, method: "getCastState", error: error)
        }
    }

    @objc func getSession(_ call: CAPPluginCall) {
        do {
            if let session = try implementation.getSession() {
                call.resolve(["session": session])
            } else {
                call.resolve(["session": NSNull()])
            }
        } catch {
            reject(call, method: "getSession", error: error)
        }
    }

    @objc func requestSession(_ call: CAPPluginCall) {
        do {
            try implementation.requestSession()
            call.resolve()
        } catch {
            reject(call, method: "requestSession", error: error)
        }
    }

    @objc func showDevicePicker(_ call: CAPPluginCall) {
        do {
            try implementation.showDevicePicker()
            call.resolve()
        } catch {
            reject(call, method: "showDevicePicker", error: error)
        }
    }

    @objc func endSession(_ call: CAPPluginCall) {
        do {
            let stopCasting = call.getBool("stopCasting") ?? true
            _ = try implementation.endSession(stopCasting: stopCasting)
            call.resolve()
        } catch {
            reject(call, method: "endSession", error: error)
        }
    }

    @objc func loadMedia(_ call: CAPPluginCall) {
        do {
            guard let request = call.options as? [String: Any] else {
                throw CastException(code: "INVALID_ARGUMENT", message: "loadMedia expects an object payload")
            }
            let result = try implementation.loadMedia(request)
            call.resolve(result)
        } catch {
            reject(call, method: "loadMedia", error: error)
        }
    }

    @objc func play(_ call: CAPPluginCall) {
        implementation.play { [weak self] error in
            if let error { self?.reject(call, method: "play", error: error) }
            else { call.resolve() }
        }
    }

    @objc func pause(_ call: CAPPluginCall) {
        implementation.pause { [weak self] error in
            if let error { self?.reject(call, method: "pause", error: error) }
            else { call.resolve() }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        implementation.stop { [weak self] error in
            if let error { self?.reject(call, method: "stop", error: error) }
            else { call.resolve() }
        }
    }

    @objc func seek(_ call: CAPPluginCall) {
        guard let position = call.getDouble("position") else {
            reject(call, method: "seek", error: CastException(code: "INVALID_ARGUMENT", message: "seek position must be a number >= 0"))
            return
        }
        implementation.seek(position) { [weak self] error in
            if let error { self?.reject(call, method: "seek", error: error) }
            else { call.resolve() }
        }
    }

    @objc func setVolume(_ call: CAPPluginCall) {
        do {
            guard let level = call.getDouble("level") else {
                throw CastException(code: "INVALID_ARGUMENT", message: "setVolume level must be in range [0, 1]")
            }

            try implementation.setVolume(level)
            call.resolve()
        } catch {
            reject(call, method: "setVolume", error: error)
        }
    }

    @objc func setMuted(_ call: CAPPluginCall) {
        do {
            guard let muted = call.getBool("muted") else {
                throw CastException(code: "INVALID_ARGUMENT", message: "setMuted requires a boolean muted value")
            }

            try implementation.setMuted(muted)
            call.resolve()
        } catch {
            reject(call, method: "setMuted", error: error)
        }
    }

    @objc func getMediaStatus(_ call: CAPPluginCall) {
        do {
            if let mediaStatus = try implementation.getMediaStatus() {
                call.resolve(["mediaStatus": mediaStatus])
            } else {
                call.resolve(["mediaStatus": NSNull()])
            }
        } catch {
            reject(call, method: "getMediaStatus", error: error)
        }
    }

    @objc func getDiscoveredDevices(_ call: CAPPluginCall) {
        do {
            call.resolve(["devices": try implementation.getDiscoveredDevices()])
        } catch {
            reject(call, method: "getDiscoveredDevices", error: error)
        }
    }

    @objc func openSettings(_ call: CAPPluginCall) {
        implementation.openSettings()
        call.resolve()
    }

    @objc func sendMessage(_ call: CAPPluginCall) {
        do {
            try implementation.sendMessage(
                namespace: call.getString("namespace"),
                message: call.options["message"]
            )
            call.resolve()
        } catch {
            reject(call, method: "sendMessage", error: error)
        }
    }

    @objc func subscribeNamespace(_ call: CAPPluginCall) {
        do {
            try implementation.subscribeNamespace(namespace: call.getString("namespace"))
            call.resolve()
        } catch {
            reject(call, method: "subscribeNamespace", error: error)
        }
    }

    @objc func unsubscribeNamespace(_ call: CAPPluginCall) {
        do {
            try implementation.unsubscribeNamespace(namespace: call.getString("namespace"))
            call.resolve()
        } catch {
            reject(call, method: "unsubscribeNamespace", error: error)
        }
    }

    private func bindImplementationEvents() {
        implementation.onCastError = { [weak self] code, message, method in
            var payload: [String: Any] = [
                "code": code,
                "message": message,
            ]

            if let method {
                payload["method"] = method
            }

            self?.notifyListeners("castError", data: payload)
        }

        implementation.onMessageReceived = { [weak self] namespace, message, raw in
            var payload: [String: Any] = [
                "namespace": namespace,
                "message": message
            ]

            if let raw {
                payload["raw"] = raw
            }

            self?.notifyListeners("messageReceived", data: payload)
        }

        implementation.onSessionStateChanged = { [weak self] payload in
            self?.notifyListeners("sessionStateChanged", data: payload)
        }

        implementation.onDevicesChanged = { [weak self] devices in
            self?.notifyListeners("devicesChanged", data: ["devices": devices])
        }
    }

    private func autoInitializeOnLoad() {
        if autoInitializeAttempted {
            return
        }
        autoInitializeAttempted = true

        guard getConfig().getBoolean("autoInitialize", true) else { return }

        do {
            let receiverApplicationId = getConfig().getString("receiverApplicationId")
                ?? getConfig().getString("receiverAppId")
            let uiMode = getConfig().getString("uiMode", "picker")
            let autoJoinPolicy = getConfig().getString("autoJoinPolicy", "origin_scoped")

            _ = try implementation.initialize(
                receiverApplicationId: receiverApplicationId,
                uiMode: uiMode,
                autoJoinPolicy: autoJoinPolicy
            )
        } catch {
            emitCastError(method: "initialize", error: error)
        }
    }

    @discardableResult
    private func emitCastError(method: String, error: Error) -> String {
        if let castError = error as? CastException {
            notifyListeners("castError", data: [
                "code": castError.code,
                "message": castError.message,
                "method": method,
            ])
            return castError.code
        }

        let message = error.localizedDescription
        notifyListeners("castError", data: [
            "code": "OPERATION_FAILED",
            "message": message,
            "method": method,
        ])
        return "OPERATION_FAILED"
    }

    private func reject(_ call: CAPPluginCall, method: String, error: Error) {
        let code = emitCastError(method: method, error: error)

        if let castError = error as? CastException {
            call.reject(castError.message, code, castError, [:])
            return
        }

        let message = error.localizedDescription
        call.reject(message, "OPERATION_FAILED", error, [:])
    }
}
