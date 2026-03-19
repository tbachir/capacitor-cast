import Foundation
import Network
import UIKit

#if canImport(GoogleCast)
import GoogleCast
#endif

private let defaultReceiverApplicationId = "CC1AD845"

struct CastException: Error {
    let code: String
    let message: String
}

#if canImport(GoogleCast)
private final class CastMessageChannel: GCKCastChannel {
    private let onMessage: (String, String) -> Void

    init(namespace: String, onMessage: @escaping (String, String) -> Void) {
        self.onMessage = onMessage
        super.init(namespace: namespace)
    }

    override func didReceiveTextMessage(_ message: String) {
        onMessage(protocolNamespace, message)
    }
}
#endif

public class Cast: NSObject {
    private(set) var initialized = false
    private(set) var localNetworkPermissionState = "prompt"
    private(set) var receiverApplicationId = ""
    private(set) var uiMode = "picker"
    private(set) var autoJoinPolicy = "origin_scoped"

    var onCastError: ((String, String, String?) -> Void)?
    var onMessageReceived: ((String, Any, String?) -> Void)?
    var onSessionStateChanged: (([String: Any]) -> Void)?
    var onDevicesChanged: (([[String: Any]]) -> Void)?

#if canImport(GoogleCast)
    private var messageChannels: [String: CastMessageChannel] = [:]
    private var subscribedMessageNamespaces: Set<String> = []
    private weak var messageChannelSession: GCKCastSession?
#endif

    deinit {
#if canImport(GoogleCast)
        if GCKCastContext.isSharedInstanceInitialized() {
            GCKCastContext.sharedInstance().sessionManager.remove(self)
        }

        detachMessageChannels()
#endif
    }

    public func initialize(
        receiverApplicationId: String?,
        uiMode: String?,
        autoJoinPolicy: String?
    ) throws -> [String: Any] {
        let configuredAppId = receiverApplicationId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let appId = configuredAppId.isEmpty ? defaultReceiverApplicationId : configuredAppId

        self.receiverApplicationId = appId
        self.uiMode = Cast.validateUiMode(uiMode)

        let normalizedJoinPolicy = autoJoinPolicy?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
        self.autoJoinPolicy = normalizedJoinPolicy.isEmpty ? "origin_scoped" : normalizedJoinPolicy

#if canImport(GoogleCast)
        try runOnMainSync {
            try configureCastContextOnMain(applicationId: appId)
            attachSessionManagerListener()
            attachDiscoveryManagerListener()
            attachMessageChannelsIfNeeded()
        }
#else
        throw CastException(
            code: "UNSUPPORTED_PLATFORM",
            message: "GoogleCast SDK is not linked in this iOS build"
        )
#endif

        self.initialized = true

        return [
            "isSupported": true,
            "uiMode": self.uiMode,
            "receiverApplicationId": self.receiverApplicationId,
        ]
    }

    public func isInitialized() -> [String: Any] {
        return [
            "isInitialized": initialized
        ]
    }

    public func checkPermissions(_ completion: @escaping ([String: Any]) -> Void) {
        guard hasLocalNetworkPermissionKeys() else {
            localNetworkPermissionState = "denied"
            completion(permissionPayload())
            return
        }
        completion(permissionPayload())
    }

    public func requestPermissions(_ completion: @escaping ([String: Any]) -> Void) {
        guard hasLocalNetworkPermissionKeys() else {
            localNetworkPermissionState = "denied"
            print("[CastPlugin] Missing NSLocalNetworkUsageDescription or NSBonjourServices in Info.plist")
            completion(permissionPayload())
            return
        }

        if localNetworkPermissionState == "granted" {
            completion(permissionPayload())
            return
        }

        probeLocalNetworkPermission { [weak self] permissionState in
            guard let self else {
                completion(["localNetwork": "prompt"])
                return
            }

            self.localNetworkPermissionState = permissionState
            completion(self.permissionPayload())
        }
    }

    public func getCapabilities() throws -> [String: Any] {
        try ensureInitialized()

#if canImport(GoogleCast)
        return [
            "isSupported": true,
            "canRequestSession": true,
            "canShowDevicePicker": uiMode == "picker",
            "supportsMediaControl": true,
            "supportsVolumeControl": true,
            "supportsCustomChannels": true,
        ]
#else
        throw CastException(code: "UNSUPPORTED_PLATFORM", message: "GoogleCast SDK is not linked in this iOS build")
#endif
    }

    public func getCastState() throws -> [String: Any] {
        try ensureInitialized()

#if canImport(GoogleCast)
        return try runOnMainSync {
            [
                "rawValue": GCKCastContext.sharedInstance().castState.rawValue
            ]
        }
#else
        throw CastException(code: "UNSUPPORTED_PLATFORM", message: "GoogleCast SDK is not linked in this iOS build")
#endif
    }

    public func getSession() throws -> [String: Any]? {
        try ensureInitialized()
#if canImport(GoogleCast)
        return try runOnMainSync {
            snapshotSession(from: GCKCastContext.sharedInstance().sessionManager.currentCastSession)
        }
#else
        return nil
#endif
    }

    public func getMediaStatus() throws -> [String: Any]? {
        try ensureInitialized()
#if canImport(GoogleCast)
        return try runOnMainSync {
            snapshotMediaStatus(from: GCKCastContext.sharedInstance().sessionManager.currentCastSession?.remoteMediaClient?.mediaStatus)
        }
#else
        return nil
#endif
    }

    public func requestSession() throws {
        try ensureInitialized()

#if canImport(GoogleCast)
        try runOnMainSync {
            if uiMode == "nativeButton" {
                throw CastException(
                    code: "UI_MODE_NOT_AVAILABLE",
                    message: "requestSession is unavailable when uiMode is nativeButton"
                )
            }

            let currentSession = GCKCastContext.sharedInstance().sessionManager.currentCastSession
            if uiMode == "headless" {
                if currentSession != nil {
                    return
                }

                throw CastException(
                    code: "UI_MODE_NOT_AVAILABLE",
                    message: "requestSession cannot open picker when uiMode is headless"
                )
            }

            ensureDiscoveryIsActive()
            GCKCastContext.sharedInstance().presentCastDialog()
        }
#else
        throw CastException(code: "UNSUPPORTED_PLATFORM", message: "GoogleCast SDK is not linked in this iOS build")
#endif
    }

    public func showDevicePicker() throws {
        try ensureInitialized()

#if canImport(GoogleCast)
        try runOnMainSync {
            if uiMode != "picker" {
                throw CastException(
                    code: "UI_MODE_NOT_AVAILABLE",
                    message: "showDevicePicker is unavailable when uiMode is \(uiMode)"
                )
            }

            ensureDiscoveryIsActive()
            GCKCastContext.sharedInstance().presentCastDialog()
        }
#else
        throw CastException(code: "UNSUPPORTED_PLATFORM", message: "GoogleCast SDK is not linked in this iOS build")
#endif
    }

    public func connectToDevice(deviceId: String?) throws {
        try ensureInitialized()

#if canImport(GoogleCast)
        try runOnMainSync {
            let resolvedDeviceId = deviceId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if resolvedDeviceId.isEmpty {
                throw CastException(
                    code: "INVALID_ARGUMENT",
                    message: "connectToDevice requires a non-empty deviceId"
                )
            }

            ensureDiscoveryIsActive()

            let manager = GCKCastContext.sharedInstance().discoveryManager
            let targetDevice = (0..<manager.deviceCount)
                .map { manager.device(at: $0) }
                .first { $0.deviceID == resolvedDeviceId }

            guard let device = targetDevice else {
                throw CastException(
                    code: "INVALID_ARGUMENT",
                    message: "Unknown cast device: \(resolvedDeviceId)"
                )
            }

            GCKCastContext.sharedInstance().sessionManager.startSession(with: device)
        }
#else
        throw CastException(code: "UNSUPPORTED_PLATFORM", message: "GoogleCast SDK is not linked in this iOS build")
#endif
    }

    public func endSession(stopCasting: Bool) throws -> Bool {
        try ensureInitialized()

#if canImport(GoogleCast)
        return try runOnMainSync {
            let sessionManager = GCKCastContext.sharedInstance().sessionManager
            guard sessionManager.currentSession != nil else {
                return false
            }

            let started = sessionManager.endSessionAndStopCasting(stopCasting)
            if !started {
                throw CastException(code: "OPERATION_FAILED", message: "Unable to end cast session")
            }

            return true
        }
#else
        throw CastException(code: "UNSUPPORTED_PLATFORM", message: "GoogleCast SDK is not linked in this iOS build")
#endif
    }

    public func loadMedia(_ request: [String: Any]) throws -> [String: Any] {
        try ensureInitialized()

#if canImport(GoogleCast)
        return try runOnMainSync {
            guard let castSession = GCKCastContext.sharedInstance().sessionManager.currentCastSession else {
                throw CastException(code: "NO_ACTIVE_SESSION", message: "No active cast session")
            }

            guard let remoteMediaClient = castSession.remoteMediaClient else {
                throw CastException(code: "OPERATION_FAILED", message: "No active media session")
            }

            guard let urlValue = request["url"] as? String,
                  let url = URL(string: urlValue),
                  !urlValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  let contentType = request["contentType"] as? String,
                  !contentType.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                throw CastException(code: "INVALID_ARGUMENT", message: "loadMedia requires url and contentType")
            }

            let mediaInfoBuilder = GCKMediaInformationBuilder(contentURL: url)
            mediaInfoBuilder.contentType = contentType
            mediaInfoBuilder.streamType = mapStreamType(request["streamType"] as? String)
            mediaInfoBuilder.customData = request["customData"]

            if let tracks = mapTracks(from: request["tracks"]) {
                mediaInfoBuilder.mediaTracks = tracks
            }

            if let metadata = buildMetadata(from: request) {
                mediaInfoBuilder.metadata = metadata
            }

            let mediaLoadBuilder = GCKMediaLoadRequestDataBuilder()
            mediaLoadBuilder.mediaInformation = mediaInfoBuilder.build()

            if let autoplay = request["autoplay"] as? Bool {
                mediaLoadBuilder.autoplay = NSNumber(value: autoplay)
            }

            if let currentTime = request["currentTime"] as? Double {
                mediaLoadBuilder.startTime = max(currentTime, 0)
            }

            if let activeTrackIds = request["activeTrackIds"] as? [NSNumber] {
                mediaLoadBuilder.activeTrackIDs = activeTrackIds
            } else if let activeTrackIds = request["activeTrackIds"] as? [Int] {
                mediaLoadBuilder.activeTrackIDs = activeTrackIds.map { NSNumber(value: $0) }
            }

            if let customData = request["customData"] {
                mediaLoadBuilder.customData = customData
            }

            let requestResult = remoteMediaClient.loadMedia(with: mediaLoadBuilder.build())
            return ["requestId": String(requestResult.requestID)]
        }
#else
        throw CastException(code: "UNSUPPORTED_PLATFORM", message: "GoogleCast SDK is not linked in this iOS build")
#endif
    }

    public func play(completion: @escaping (Error?) -> Void) {
        do { try ensureInitialized() } catch { completion(error); return }
#if canImport(GoogleCast)
        DispatchQueue.main.async {
            guard let client = GCKCastContext.sharedInstance().sessionManager.currentCastSession?.remoteMediaClient else {
                completion(CastException(code: "OPERATION_FAILED", message: "No active media session"))
                return
            }
            client.play().delegate = GCKCastRequestDelegate({ completion(nil) }, { e in
                completion(CastException(code: "OPERATION_FAILED", message: e?.localizedDescription ?? "play failed"))
            })
        }
#else
        completion(CastException(code: "UNSUPPORTED_PLATFORM", message: "GoogleCast SDK is not linked in this iOS build"))
#endif
    }

    public func pause(completion: @escaping (Error?) -> Void) {
        do { try ensureInitialized() } catch { completion(error); return }
#if canImport(GoogleCast)
        DispatchQueue.main.async {
            guard let client = GCKCastContext.sharedInstance().sessionManager.currentCastSession?.remoteMediaClient else {
                completion(CastException(code: "OPERATION_FAILED", message: "No active media session"))
                return
            }
            client.pause().delegate = GCKCastRequestDelegate({ completion(nil) }, { e in
                completion(CastException(code: "OPERATION_FAILED", message: e?.localizedDescription ?? "pause failed"))
            })
        }
#else
        completion(CastException(code: "UNSUPPORTED_PLATFORM", message: "GoogleCast SDK is not linked in this iOS build"))
#endif
    }

    public func stop(completion: @escaping (Error?) -> Void) {
        do { try ensureInitialized() } catch { completion(error); return }
#if canImport(GoogleCast)
        DispatchQueue.main.async {
            guard let client = GCKCastContext.sharedInstance().sessionManager.currentCastSession?.remoteMediaClient else {
                completion(CastException(code: "OPERATION_FAILED", message: "No active media session"))
                return
            }
            client.stop().delegate = GCKCastRequestDelegate({ completion(nil) }, { e in
                completion(CastException(code: "OPERATION_FAILED", message: e?.localizedDescription ?? "stop failed"))
            })
        }
#else
        completion(CastException(code: "UNSUPPORTED_PLATFORM", message: "GoogleCast SDK is not linked in this iOS build"))
#endif
    }

    public func seek(_ position: Double, completion: @escaping (Error?) -> Void) {
        if !position.isFinite || position < 0 {
            completion(CastException(code: "INVALID_ARGUMENT", message: "seek position must be a number >= 0"))
            return
        }
        do { try ensureInitialized() } catch { completion(error); return }
#if canImport(GoogleCast)
        DispatchQueue.main.async {
            guard let client = GCKCastContext.sharedInstance().sessionManager.currentCastSession?.remoteMediaClient else {
                completion(CastException(code: "OPERATION_FAILED", message: "No active media session"))
                return
            }
            let options = GCKMediaSeekOptions()
            options.interval = position
            client.seek(with: options).delegate = GCKCastRequestDelegate({ completion(nil) }, { e in
                completion(CastException(code: "OPERATION_FAILED", message: e?.localizedDescription ?? "seek failed"))
            })
        }
#else
        completion(CastException(code: "UNSUPPORTED_PLATFORM", message: "GoogleCast SDK is not linked in this iOS build"))
#endif
    }

    public func setVolume(_ level: Double) throws {
        try ensureInitialized()

        if !level.isFinite || level < 0 || level > 1 {
            throw CastException(code: "INVALID_ARGUMENT", message: "setVolume level must be in range [0, 1]")
        }

#if canImport(GoogleCast)
        try runOnMainSync {
            guard let castSession = GCKCastContext.sharedInstance().sessionManager.currentCastSession else {
                throw CastException(code: "NO_ACTIVE_SESSION", message: "No active cast session")
            }

            _ = castSession.setDeviceVolume(Float(level))
        }
#else
        throw CastException(code: "UNSUPPORTED_PLATFORM", message: "GoogleCast SDK is not linked in this iOS build")
#endif
    }

    public func setMuted(_ muted: Bool) throws {
        try ensureInitialized()

#if canImport(GoogleCast)
        try runOnMainSync {
            guard let castSession = GCKCastContext.sharedInstance().sessionManager.currentCastSession else {
                throw CastException(code: "NO_ACTIVE_SESSION", message: "No active cast session")
            }

            _ = castSession.setDeviceMuted(muted)
        }
#else
        throw CastException(code: "UNSUPPORTED_PLATFORM", message: "GoogleCast SDK is not linked in this iOS build")
#endif
    }

    public func sendMessage(namespace: String?, message: Any?) throws {
        try ensureInitialized()

#if canImport(GoogleCast)
        try runOnMainSync {
            guard let castSession = GCKCastContext.sharedInstance().sessionManager.currentCastSession else {
                throw CastException(code: "NO_ACTIVE_SESSION", message: "No active cast session")
            }

            guard let namespace = normalizeNamespace(namespace) else {
                throw CastException(code: "INVALID_ARGUMENT", message: "sendMessage requires a non-empty namespace")
            }

            let messageText = try normalizeOutgoingMessage(message)
            let channel = ensureMessageChannel(namespace)

            if messageChannelSession !== castSession {
                detachMessageChannels()
                messageChannelSession = castSession
            }
            _ = castSession.add(channel)

            if !channel.isConnected || !channel.isWritable {
                _ = waitUntilChannelReady(channel, timeout: 0.5)
            }

            guard channel.isConnected && channel.isWritable else {
                throw CastException(
                    code: "OPERATION_FAILED",
                    message: "Channel is not connected or is not registered with a session"
                )
            }

            var castError: GCKError?
            if !channel.sendTextMessage(messageText, error: &castError) {
                throw CastException(
                    code: "OPERATION_FAILED",
                    message: castError?.localizedDescription ?? "Failed to send custom cast message"
                )
            }
        }
#else
        throw CastException(code: "UNSUPPORTED_PLATFORM", message: "GoogleCast SDK is not linked in this iOS build")
#endif
    }

    public func subscribeNamespace(namespace: String?) throws {
        try ensureInitialized()

#if canImport(GoogleCast)
        try runOnMainSync {
            guard let namespace = normalizeNamespace(namespace) else {
                throw CastException(
                    code: "INVALID_ARGUMENT",
                    message: "subscribeNamespace requires a non-empty namespace"
                )
            }

            subscribedMessageNamespaces.insert(namespace)
            _ = ensureMessageChannel(namespace)
            attachMessageChannelsIfNeeded()
        }
#else
        throw CastException(code: "UNSUPPORTED_PLATFORM", message: "GoogleCast SDK is not linked in this iOS build")
#endif
    }

    public func unsubscribeNamespace(namespace: String?) throws {
        try ensureInitialized()

#if canImport(GoogleCast)
        try runOnMainSync {
            guard let namespace = normalizeNamespace(namespace) else {
                throw CastException(
                    code: "INVALID_ARGUMENT",
                    message: "unsubscribeNamespace requires a non-empty namespace"
                )
            }

            subscribedMessageNamespaces.remove(namespace)
        }
#else
        throw CastException(code: "UNSUPPORTED_PLATFORM", message: "GoogleCast SDK is not linked in this iOS build")
#endif
    }

    private func ensureInitialized() throws {
        if !initialized {
            throw CastException(code: "NOT_INITIALIZED", message: "Call initialize() before using cast APIs")
        }
    }

    private func hasLocalNetworkPermissionKeys() -> Bool {
        guard let infoDictionary = Bundle.main.infoDictionary else {
            return false
        }

        let usageDescription = (infoDictionary["NSLocalNetworkUsageDescription"] as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let bonjourServices = infoDictionary["NSBonjourServices"] as? [String]

        return !(usageDescription?.isEmpty ?? true) && !(bonjourServices?.isEmpty ?? true)
    }

    private func probeLocalNetworkPermission(_ completion: @escaping (String) -> Void) {
        let queue = DispatchQueue(label: "com.strasberry.plugins.capacitorcast.localnetwork.permission")
        let parameters = NWParameters.tcp
        parameters.includePeerToPeer = true

        let browser = NWBrowser(
            for: .bonjour(type: "_googlecast._tcp", domain: "local."),
            using: parameters
        )

        var isResolved = false

        let resolve: (String) -> Void = { permissionState in
            if isResolved {
                return
            }

            isResolved = true
            browser.cancel()
            completion(permissionState)
        }

        let resolveFromNetworkError: (NWError) -> Void = { [weak self] error in
            guard let self else {
                resolve("prompt")
                return
            }

            resolve(self.isPolicyDenied(error) ? "denied" : "prompt")
        }

        browser.stateUpdateHandler = { state in
            switch state {
            case .ready:
                resolve("granted")
            case .failed(let error):
                resolveFromNetworkError(error)
            case .waiting(let error):
                resolveFromNetworkError(error)
            default:
                break
            }
        }

        browser.browseResultsChangedHandler = { results, _ in
            if !results.isEmpty {
                resolve("granted")
            }
        }

        queue.asyncAfter(deadline: .now() + 4.0) {
            resolve("prompt")
        }

        browser.start(queue: queue)
    }

    private func isPolicyDenied(_ error: NWError) -> Bool {
        let description = String(describing: error).lowercased()
        return
            description.contains("policy") && description.contains("denied") ||
            description.contains("eacces") ||
            description.contains("eperm")
    }

    private func permissionPayload() -> [String: Any] {
        return [
            "localNetwork": localNetworkPermissionState
        ]
    }

#if canImport(GoogleCast)
    private func runOnMainSync<T>(_ work: () throws -> T) throws -> T {
        if Thread.isMainThread {
            return try work()
        }

        var result: Result<T, Error>?
        DispatchQueue.main.sync {
            result = Result { try work() }
        }

        guard let result else {
            throw CastException(code: "OPERATION_FAILED", message: "Main-thread execution failed")
        }

        switch result {
        case .success(let value):
            return value
        case .failure(let error):
            throw error
        }
    }

    private func configureCastContextOnMain(applicationId: String) throws {
        if GCKCastContext.isSharedInstanceInitialized() {
            return
        }

        let criteria = GCKDiscoveryCriteria(applicationID: applicationId)
        let options = GCKCastOptions(discoveryCriteria: criteria)
        options.physicalVolumeButtonsWillControlDeviceVolume = true
        options.disableDiscoveryAutostart = true
        options.startDiscoveryAfterFirstTapOnCastButton = true

        var castError: GCKError?
        let initialized = GCKCastContext.setSharedInstanceWith(options, error: &castError)
        if !initialized {
            throw CastException(
                code: "OPERATION_FAILED",
                message: castError?.localizedDescription ?? "Failed to initialize Google Cast context"
            )
        }
    }

    private func attachSessionManagerListener() {
        let sessionManager = GCKCastContext.sharedInstance().sessionManager
        sessionManager.remove(self)
        sessionManager.add(self)
    }

    private func attachDiscoveryManagerListener() {
        let manager = GCKCastContext.sharedInstance().discoveryManager
        manager.remove(self)
        manager.add(self)
    }

    private func emitDevicesChanged() {
        guard let devices = try? getDiscoveredDevices() else { return }
        onDevicesChanged?(devices)
    }

    public func getDiscoveredDevices() throws -> [[String: Any]] {
        try ensureInitialized()
#if canImport(GoogleCast)
        return try runOnMainSync {
            ensureDiscoveryIsActive()
            let manager = GCKCastContext.sharedInstance().discoveryManager
            let connectedDeviceId = GCKCastContext.sharedInstance().sessionManager.currentCastSession?.device.deviceID
            return (0..<manager.deviceCount).map { i in
                let device = manager.device(at: i)
                var entry: [String: Any] = [
                    "deviceId": device.deviceID,
                    "friendlyName": device.friendlyName ?? device.deviceID,
                    "isConnected": device.deviceID == connectedDeviceId,
                ]
                if let model = device.modelName { entry["modelName"] = model }
                return entry
            }
        }
#else
        throw CastException(code: "UNSUPPORTED_PLATFORM", message: "GoogleCast SDK is not linked in this iOS build")
#endif
    }

    public func rescanDevices() throws -> [[String: Any]] {
        try ensureInitialized()
#if canImport(GoogleCast)
        return try runOnMainSync {
            restartDiscoveryCycle()
            return try getDiscoveredDevices()
        }
#else
        throw CastException(code: "UNSUPPORTED_PLATFORM", message: "GoogleCast SDK is not linked in this iOS build")
#endif
    }

    public func openSettings() {
#if canImport(UIKit)
        DispatchQueue.main.async {
            if let url = URL(string: UIApplication.openSettingsURLString) {
                UIApplication.shared.open(url)
            }
        }
#endif
    }

    private func restartDiscoveryCycle() {
        let discoveryManager = GCKCastContext.sharedInstance().discoveryManager
        discoveryManager.stopDiscovery()
        discoveryManager.startDiscovery()
    }

    private func ensureDiscoveryIsActive() {
        let discoveryManager = GCKCastContext.sharedInstance().discoveryManager
        if !discoveryManager.discoveryActive {
            discoveryManager.startDiscovery()
        }
    }

    @discardableResult
    private func ensureMessageChannel(_ namespace: String) -> CastMessageChannel {
        let trimmed = namespace.trimmingCharacters(in: .whitespacesAndNewlines)
        if let existing = messageChannels[trimmed] {
            return existing
        }

        let channel = CastMessageChannel(namespace: trimmed) { [weak self] namespace, message in
            self?.emitMessageReceived(namespace: namespace, rawMessage: message)
        }
        messageChannels[trimmed] = channel
        return channel
    }

    private func attachMessageChannelsIfNeeded() {
        let nextSession = GCKCastContext.sharedInstance().sessionManager.currentCastSession

        if messageChannelSession !== nextSession {
            detachMessageChannels()
            messageChannelSession = nextSession
        }

        guard let session = messageChannelSession else {
            return
        }

        for channel in messageChannels.values {
            _ = session.add(channel)
        }
    }

    private func detachMessageChannels() {
        guard let session = messageChannelSession else {
            return
        }

        for channel in messageChannels.values {
            _ = session.remove(channel)
        }

        messageChannelSession = nil
    }

    private func waitUntilChannelReady(_ channel: GCKCastChannel, timeout: TimeInterval) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if channel.isConnected && channel.isWritable {
                return true
            }

            RunLoop.main.run(mode: .default, before: Date().addingTimeInterval(0.01))
        }

        return channel.isConnected && channel.isWritable
    }

    private func normalizeNamespace(_ namespace: String?) -> String? {
        let trimmed = namespace?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !trimmed.isEmpty {
            return trimmed
        }

        return nil
    }

    private func normalizeOutgoingMessage(_ message: Any?) throws -> String {
        if let textMessage = message as? String {
            return textMessage
        }

        guard let message = message else {
            throw CastException(code: "INVALID_ARGUMENT", message: "sendMessage.message is required")
        }

        guard let payload = message as? [String: Any] else {
            throw CastException(code: "INVALID_ARGUMENT", message: "sendMessage.message must be a string or object")
        }

        guard JSONSerialization.isValidJSONObject(payload) else {
            throw CastException(code: "INVALID_ARGUMENT", message: "sendMessage.message must be JSON serializable")
        }

        do {
            let data = try JSONSerialization.data(withJSONObject: payload, options: [])
            guard let raw = String(data: data, encoding: .utf8) else {
                throw CastException(code: "OPERATION_FAILED", message: "Failed to encode outgoing message payload")
            }
            return raw
        } catch {
            throw CastException(code: "INVALID_ARGUMENT", message: "sendMessage.message must be JSON serializable")
        }
    }

    private func emitMessageReceived(namespace: String, rawMessage: String) {
        if !subscribedMessageNamespaces.contains(namespace) {
            return
        }

        if let parsedMessage = parseJSONObject(rawMessage) {
            onMessageReceived?(namespace, parsedMessage, rawMessage)
            return
        }

        onMessageReceived?(namespace, rawMessage, rawMessage)
    }

    private func emitSessionStateChanged(source: String) {
        let payload = sessionStatePayload(source: source)
        onSessionStateChanged?(payload)
    }

    private func sessionStatePayload(source: String) -> [String: Any] {
        let sessionManager = GCKCastContext.sharedInstance().sessionManager
        return [
            "source": source,
            "castState": [
                "rawValue": GCKCastContext.sharedInstance().castState.rawValue
            ],
            "session": snapshotSession(from: sessionManager.currentCastSession) ?? NSNull(),
            "mediaStatus": snapshotMediaStatus(from: sessionManager.currentCastSession?.remoteMediaClient?.mediaStatus) ?? NSNull(),
        ]
    }

    private func parseJSONObject(_ rawMessage: String) -> [String: Any]? {
        guard let data = rawMessage.data(using: .utf8) else {
            return nil
        }

        guard let parsed = try? JSONSerialization.jsonObject(with: data, options: []),
              let dictionary = parsed as? [String: Any] else {
            return nil
        }

        return dictionary
    }

    private func snapshotSession(from session: GCKCastSession?) -> [String: Any]? {
        guard let session = session else {
            return nil
        }

        let appMetadata = session.applicationMetadata

        return [
            "sessionID": session.sessionID as Any,
            "connectionStateRaw": session.connectionState.rawValue,
            "receiverApplicationID": appMetadata?.applicationID as Any,
            "receiverFriendlyName": session.device.friendlyName as Any,
            "supportedNamespaces": appMetadata?.namespaces ?? [],
        ]
    }

    private func snapshotMediaStatus(from status: GCKMediaStatus?) -> [String: Any]? {
        guard let status = status else {
            return nil
        }

        let mediaInfo = status.mediaInformation

        return [
            "mediaSessionID": status.mediaSessionID,
            "playerStateRaw": status.playerState.rawValue,
            "idleReasonRaw": status.idleReason.rawValue,
            "streamPosition": status.streamPosition,
            "playbackRate": status.playbackRate,
            "volume": status.volume,
            "isMuted": status.isMuted,
            "contentID": mediaInfo?.contentID as Any,
            "contentURL": mediaInfo?.contentURL?.absoluteString as Any,
            "contentType": mediaInfo?.contentType as Any,
            "streamTypeRaw": mediaInfo?.streamType.rawValue as Any,
            "streamDuration": mediaInfo?.streamDuration as Any,
        ]
    }

    private func mapStreamType(_ value: String?) -> GCKMediaStreamType {
        switch value {
        case "LIVE":
            return .live
        case "OTHER":
            return .none
        default:
            return .buffered
        }
    }

    private func buildMetadata(from request: [String: Any]) -> GCKMediaMetadata? {
        let metadata = GCKMediaMetadata(metadataType: .generic)

        let metadataPayload = request["metadata"] as? [String: Any]
        let title = (request["title"] as? String) ?? (metadataPayload?["title"] as? String)
        let subtitle = (request["subtitle"] as? String) ?? (metadataPayload?["subtitle"] as? String)

        if let title {
            metadata.setString(title, forKey: kGCKMetadataKeyTitle)
        }

        if let subtitle {
            metadata.setString(subtitle, forKey: kGCKMetadataKeySubtitle)
        }

        if let studio = metadataPayload?["studio"] as? String {
            metadata.setString(studio, forKey: kGCKMetadataKeyStudio)
        }

        if let releaseDate = metadataPayload?["releaseDate"] as? String {
            metadata.setString(releaseDate, forKey: kGCKMetadataKeyReleaseDate)
        }

        var imageUrls: [String] = []

        if let posterUrl = request["posterUrl"] as? String, !posterUrl.isEmpty {
            imageUrls.append(posterUrl)
        }

        if let extraImages = metadataPayload?["images"] as? [String] {
            imageUrls.append(contentsOf: extraImages.filter { !$0.isEmpty })
        }

        for imageUrl in imageUrls {
            guard let url = URL(string: imageUrl) else {
                continue
            }
            metadata.addImage(GCKImage(url: url, width: 0, height: 0))
        }

        if let customData = metadataPayload?["customData"] {
            metadata.setValue(customData, forKey: "customData")
        }

        if metadata.allKeys().isEmpty {
            return nil
        }

        return metadata
    }

    private func mapTracks(from rawTracks: Any?) -> [GCKMediaTrack]? {
        guard let rawTracks = rawTracks as? [[String: Any]], !rawTracks.isEmpty else {
            return nil
        }

        var tracks: [GCKMediaTrack] = []
        tracks.reserveCapacity(rawTracks.count)

        for track in rawTracks {
            guard let trackId = track["trackId"] as? Int,
                  let typeString = track["type"] as? String else {
                continue
            }

            guard let trackType = mapTrackType(typeString),
                  let builtTrack = GCKMediaTrack(
                    identifier: trackId,
                    contentIdentifier: track["contentId"] as? String,
                    contentType: (track["contentType"] as? String) ?? "",
                    type: trackType,
                    textSubtype: mapTrackSubtype(track["subtype"] as? String),
                    name: track["name"] as? String,
                    languageCode: track["language"] as? String,
                    customData: track["customData"]
                  ) else {
                continue
            }

            tracks.append(builtTrack)
        }

        return tracks.isEmpty ? nil : tracks
    }

    private func mapTrackType(_ value: String) -> GCKMediaTrackType? {
        switch value {
        case "TEXT":
            return .text
        case "AUDIO":
            return .audio
        case "VIDEO":
            return .video
        default:
            return nil
        }
    }

    private func mapTrackSubtype(_ value: String?) -> GCKMediaTextTrackSubtype {
        switch value {
        case "SUBTITLES":
            return .subtitles
        case "CAPTIONS":
            return .captions
        case "DESCRIPTIONS":
            return .descriptions
        case "CHAPTERS":
            return .chapters
        case "METADATA":
            return .metadata
        default:
            return .unknown
        }
    }
#endif

    private static func validateUiMode(_ value: String?) -> String {
        switch value {
        case "picker":
            return "picker"
        case "nativeButton":
            return "nativeButton"
        case "headless":
            return "headless"
        default:
            return "picker"
        }
    }
}

#if canImport(GoogleCast)
extension Cast: GCKSessionManagerListener {
    public func sessionManager(_ sessionManager: GCKSessionManager, didStart session: GCKCastSession) {
        attachMessageChannelsIfNeeded()
        emitSessionStateChanged(source: "SESSION_STARTED")
    }

    public func sessionManager(_ sessionManager: GCKSessionManager, didResumeCastSession session: GCKCastSession) {
        attachMessageChannelsIfNeeded()
        emitSessionStateChanged(source: "SESSION_RESUMED")
    }

    public func sessionManager(_ sessionManager: GCKSessionManager, didEnd session: GCKCastSession, withError error: Error?) {
        if let error {
            onCastError?("OPERATION_FAILED", error.localizedDescription, "sessionManager.didEndCastSession")
        }

        detachMessageChannels()
        emitSessionStateChanged(source: "SESSION_ENDED")
    }

    public func sessionManager(_ sessionManager: GCKSessionManager, didFailToStart session: GCKCastSession, withError error: Error) {
        onCastError?("OPERATION_FAILED", error.localizedDescription, "sessionManager.didFailToStartCastSession")
        detachMessageChannels()
        emitSessionStateChanged(source: "SESSION_START_FAILED")
    }

    public func sessionManager(_ sessionManager: GCKSessionManager, didSuspend session: GCKCastSession, with reason: GCKConnectionSuspendReason) {
        emitSessionStateChanged(source: "SESSION_SUSPENDED")
    }
}

// MARK: - GCKDiscoveryManagerListener

extension Cast: GCKDiscoveryManagerListener {
    public func didInsertDevice(_ device: GCKDevice, at index: UInt) {
        emitDevicesChanged()
    }

    public func didUpdateDevice(_ device: GCKDevice, at index: UInt, previousIndex: UInt) {
        emitDevicesChanged()
    }

    public func didRemoveDevice(withID deviceID: String, at index: UInt) {
        emitDevicesChanged()
    }
}

// MARK: - GCKCastRequestDelegate

private final class GCKCastRequestDelegate: NSObject, GCKRequestDelegate {
    private let onSuccess: () -> Void
    private let onFailure: (GCKError?) -> Void

    init(_ onSuccess: @escaping () -> Void, _ onFailure: @escaping (GCKError?) -> Void) {
        self.onSuccess = onSuccess
        self.onFailure = onFailure
    }

    func requestDidComplete(_ request: GCKRequest) { onSuccess() }
    func request(_ request: GCKRequest, didFailWithError error: GCKError) { onFailure(error) }
}
#endif
