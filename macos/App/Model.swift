import SwiftUI

/// `GET /status` from the plugin's Mac app address.
struct AirconStatus: Codable, Equatable, Sendable {
    var online: Bool
    var updatedAt: Date?
    var sleepTimerMinutes: Int
    var aircon: Unit?
    var zones: [Zone]

    struct Unit: Codable, Equatable, Sendable {
        var name: String
        var power: Bool
        var mode: Mode
        var run: String
        var fan: FanSpeed
        var setTemp: Double
        var roomTemp: Double
        /// Minutes until the aircon turns itself off; 0 when no countdown runs.
        var offCountdown: Int
        var errorCode: String
    }

    struct Zone: Codable, Equatable, Identifiable, Sendable {
        var id: String
        var name: String
        var open: Bool
        var damper: Int
        var constant: Bool
        var temperature: Double?
    }

    var openZones: Int {
        zones.filter(\.open).count
    }
}

/// `POST /control`: only the fields that are set change.
struct ControlRequest: Encodable, Equatable, Sendable {
    var power: Bool?
    var mode: Mode?
    var fan: FanSpeed?
    var setTemp: Double?
    var sleepTimer: Bool?
    var zones: [String: ZoneChange]?

    struct ZoneChange: Encodable, Equatable, Sendable {
        var open: Bool?
        var damper: Int?
    }
}

enum Mode: String, Codable, CaseIterable, Identifiable, Sendable {
    case cool, heat, vent, dry

    var id: Self { self }

    var title: LocalizedStringKey {
        switch self {
        case .cool: "Cool"
        case .heat: "Heat"
        case .vent: "Fan"
        case .dry: "Dry"
        }
    }

    var symbol: String {
        switch self {
        case .cool: "snowflake"
        case .heat: "flame.fill"
        case .vent: "fan.fill"
        case .dry: "humidity.fill"
        }
    }

    /// Colours in the spirit of Apple's climate controls: icy blue, warm orange, fresh mint, dry indigo.
    var tint: Color {
        switch self {
        case .cool: Color(red: 0.10, green: 0.62, blue: 1.00)
        case .heat: Color(red: 1.00, green: 0.45, blue: 0.13)
        case .vent: Color(red: 0.16, green: 0.76, blue: 0.66)
        case .dry: Color(red: 0.42, green: 0.40, blue: 0.95)
        }
    }

    /// Heat and cool aim for the setpoint; fan and dry ignore it.
    var usesSetpoint: Bool {
        self == .cool || self == .heat
    }

    func runningText(setTemp: Double) -> String {
        switch self {
        case .cool: String(localized: "Cooling to \(Format.degrees(setTemp))")
        case .heat: String(localized: "Heating to \(Format.degrees(setTemp))")
        case .vent: String(localized: "Fan only")
        case .dry: String(localized: "Drying")
        }
    }
}

enum FanSpeed: String, Codable, CaseIterable, Identifiable, Sendable {
    case low, medium, high, auto

    var id: Self { self }

    var title: LocalizedStringKey {
        switch self {
        case .low: "Low"
        case .medium: "Medium"
        case .high: "High"
        case .auto: "Auto"
        }
    }
}

enum Format {
    static func degrees(_ value: Double) -> String {
        value.rounded() == value ? "\(Int(value))°" : String(format: "%.1f°", value)
    }

    /// "1 h 57 m", "45 m".
    static func duration(minutes: Int) -> String {
        let hours = minutes / 60, rest = minutes % 60
        if hours == 0 {
            return String(localized: "\(rest) min")
        }
        return rest == 0 ? String(localized: "\(hours) h") : String(localized: "\(hours) h \(rest) min")
    }
}

extension AirconStatus {
    /// Shown before the first reading and in previews: Brendan's layout, cooling with two zones open.
    static let sample = AirconStatus(
        online: true,
        updatedAt: .now,
        sleepTimerMinutes: 120,
        aircon: Unit(name: "AC", power: true, mode: .cool, run: "climate", fan: .high, setTemp: 20, roomTemp: 20,
                     offCountdown: 117, errorCode: ""),
        zones: [
            Zone(id: "z01", name: "Lounge", open: false, damper: 100, constant: true),
            Zone(id: "z02", name: "Sitting", open: false, damper: 100, constant: true),
            Zone(id: "z03", name: "Media", open: false, damper: 5, constant: false),
            Zone(id: "z04", name: "Rumpus", open: true, damper: 100, constant: false),
            Zone(id: "z05", name: "Master Bed", open: true, damper: 70, constant: false),
            Zone(id: "z06", name: "Winters Room", open: false, damper: 100, constant: false),
            Zone(id: "z07", name: "Bed 3", open: false, damper: 100, constant: false),
            Zone(id: "z08", name: "Bed 4", open: false, damper: 100, constant: false),
        ]
    )
}
