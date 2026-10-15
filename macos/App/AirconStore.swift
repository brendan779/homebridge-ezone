import Foundation
import Observation
import OSLog

/// Talks to the plugin's Mac app address: reads `/status` (every 20 s in the background, every 2 s while the popover
/// is open) and sends changes to `/control`. Every change shows at once and is confirmed by the plugin's reply.
@MainActor
@Observable
final class AirconStore {
    static let defaultAddress = "http://192.168.0.239:8583"
    static let backgroundInterval: Duration = .seconds(20)
    static let foregroundInterval: Duration = .seconds(2)
    /// The menu bar shows the aircon as unreachable after this long without a reading.
    static let staleAfter: TimeInterval = 70

    private(set) var status: AirconStatus?
    private(set) var problem: String?
    private(set) var lastReading: Date?
    /// While true the store polls quickly; set by the popover.
    var isShowing = false {
        didSet {
            if isShowing && !oldValue {
                wake()
            }
        }
    }

    private var loop: Task<Void, Never>?
    private var sleeper: Task<Void, Never>?
    private var pendingTemp: Task<Void, Never>?
    /// Readings that started before the latest change would undo it on screen, so they're dropped.
    private var generation = 0
    private let session: URLSession
    private let log = Logger(subsystem: "io.github.brendan779.Aircon", category: "store")

    init(session: URLSession = .shared) {
        self.session = session
    }

    var address: String {
        UserDefaults.standard.string(forKey: "address") ?? Self.defaultAddress
    }

    var isStale: Bool {
        guard let lastReading else {
            return true
        }
        return Date.now.timeIntervalSince(lastReading) > Self.staleAfter || status?.online == false
    }

    func start() {
        guard loop == nil else {
            return
        }
        loop = Task { [weak self] in
            while !Task.isCancelled, let self {
                await self.refresh()
                await self.nap()
            }
        }
    }

    func setAddress(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        UserDefaults.standard.set(trimmed.isEmpty ? nil : trimmed, forKey: "address")
        status = nil
        problem = nil
        lastReading = nil
        wake()
    }

    // MARK: Changes

    func setPower(_ on: Bool) {
        send(ControlRequest(power: on)) { $0.aircon?.power = on; if !on { $0.aircon?.offCountdown = 0 } }
    }

    func setMode(_ mode: Mode) {
        send(ControlRequest(mode: mode)) { $0.aircon?.mode = mode }
    }

    func setFan(_ fan: FanSpeed) {
        send(ControlRequest(fan: fan)) { $0.aircon?.fan = fan }
    }

    /// Steps the setpoint; quick taps are sent as one change.
    func nudgeTemperature(by step: Double) {
        guard let current = status?.aircon?.setTemp else {
            return
        }
        let value = min(32, max(16, current + step))
        status?.aircon?.setTemp = value
        generation += 1
        pendingTemp?.cancel()
        pendingTemp = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(600))
            guard !Task.isCancelled else {
                return
            }
            self?.send(ControlRequest(setTemp: value)) { $0.aircon?.setTemp = value }
        }
    }

    func setSleepTimer(_ on: Bool) {
        let minutes = status?.sleepTimerMinutes ?? 120
        send(ControlRequest(sleepTimer: on)) { $0.aircon?.offCountdown = on ? minutes : 0 }
    }

    func setZone(_ id: String, open: Bool) {
        send(ControlRequest(zones: [id: .init(open: open)])) { status in
            status.zones.indices.filter { status.zones[$0].id == id }.forEach { status.zones[$0].open = open }
        }
    }

    func nudgeDamper(_ id: String, by step: Int) {
        guard let zone = status?.zones.first(where: { $0.id == id }) else {
            return
        }
        let damper = min(100, max(5, zone.damper + step))
        send(ControlRequest(zones: [id: .init(damper: damper)])) { status in
            status.zones.indices.filter { status.zones[$0].id == id }.forEach { status.zones[$0].damper = damper }
        }
    }

    // MARK: Plumbing

    private func send(_ request: ControlRequest, expect: (inout AirconStatus) -> Void) {
        guard var shown = status else {
            return
        }
        expect(&shown)
        status = shown
        generation += 1
        let generation = generation
        Task {
            do {
                let reply: AirconStatus = try await call("control", body: request)
                if generation == self.generation {
                    accept(reply)
                }
            } catch {
                log.error("Change failed: \(error.localizedDescription, privacy: .public)")
                problem = String(localized: "Couldn't change the aircon: \(error.localizedDescription)")
                wake()
            }
        }
    }

    func refresh() async {
        let generation = generation
        do {
            let reply: AirconStatus = try await call("status", body: nil as ControlRequest?)
            if generation == self.generation {
                accept(reply)
            }
        } catch {
            problem = Self.describe(error, address: address)
        }
    }

    private func accept(_ reply: AirconStatus) {
        status = reply
        lastReading = .now
        problem = reply.online ? nil : String(localized: "Homebridge can't reach the e-zone tablet.")
    }

    private func call<Body: Encodable>(_ path: String, body: Body?) async throws -> AirconStatus {
        guard let base = URL(string: address), base.scheme?.hasPrefix("http") == true else {
            throw URLError(.badURL)
        }
        var request = URLRequest(url: base.appending(path: path), timeoutInterval: 8)
        if let body {
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(body)
        }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }
        guard http.statusCode == 200 else {
            let message = (try? JSONDecoder().decode([String: String].self, from: data))?["error"]
            throw AirconError.server(message ?? HTTPURLResponse.localizedString(forStatusCode: http.statusCode))
        }
        return try Self.decoder.decode(AirconStatus.self, from: data)
    }

    nonisolated static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let text = try decoder.singleValueContainer().decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            guard let date = formatter.date(from: text) ?? ISO8601DateFormatter().date(from: text) else {
                throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Bad date \(text)"))
            }
            return date
        }
        return decoder
    }()

    private static func describe(_ error: Error, address: String) -> String {
        if case AirconError.server(let message) = error {
            return message
        }
        if let url = error as? URLError {
            switch url.code {
            case .badURL, .unsupportedURL:
                return String(localized: "Check the Homebridge address in Settings.")
            case .cannotConnectToHost:
                // The host answered but nothing listens on that port: the plugin's Mac app address is off.
                return String(localized: "Homebridge answered, but Mac app access is off. Turn on Mac app in the e-zone plugin settings and restart its bridge.")
            case .cannotFindHost, .timedOut, .networkConnectionLost, .notConnectedToInternet:
                return String(localized: "Can't reach Homebridge at \(address).")
            default:
                break
            }
        }
        return error.localizedDescription
    }

    private func nap() async {
        let interval = isShowing ? Self.foregroundInterval : Self.backgroundInterval
        let task = Task { _ = try? await Task.sleep(for: interval) }
        sleeper = task
        await task.value
    }

    /// Cuts the current wait short so a reading happens now.
    private func wake() {
        sleeper?.cancel()
    }
}

enum AirconError: LocalizedError {
    case server(String)

    var errorDescription: String? {
        switch self {
        case .server(let message): message
        }
    }
}
