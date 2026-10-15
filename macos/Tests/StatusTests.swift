import Foundation
import Testing
@testable import Aircon

struct StatusTests {
    /// A reply captured from the plugin's `/status` (mock tablet, cooling with the sleep timer on).
    static let reply = #"""
    {"online":true,"updatedAt":"2026-10-15T09:22:42.823Z","sleepTimerMinutes":120,
     "aircon":{"name":"AC","power":true,"mode":"heat","run":"climate","fan":"low","setTemp":20,"roomTemp":20,"offCountdown":117,"errorCode":""},
     "zones":[{"id":"z01","name":"Lounge","open":false,"damper":100,"constant":true,"temperature":null},
              {"id":"z03","name":"Media","open":true,"damper":50,"constant":false,"temperature":null}]}
    """#

    @Test func decodesThePluginReply() throws {
        let status = try AirconStore.decoder.decode(AirconStatus.self, from: Data(Self.reply.utf8))
        #expect(status.online)
        #expect(status.aircon?.mode == .heat)
        #expect(status.aircon?.fan == .low)
        #expect(status.aircon?.offCountdown == 117)
        #expect(status.zones.map(\.name) == ["Lounge", "Media"])
        #expect(status.openZones == 1)
        #expect(status.updatedAt != nil)
    }

    @Test func encodesOnlyWhatChanges() throws {
        let body = try JSONEncoder().encode(ControlRequest(zones: ["z03": .init(open: true)]))
        #expect(String(decoding: body, as: UTF8.self) == #"{"zones":{"z03":{"open":true}}}"#)
    }

    @Test func formatsDurationsAndDegrees() {
        #expect(Format.duration(minutes: 117) == "1 h 57 min")
        #expect(Format.duration(minutes: 120) == "2 h")
        #expect(Format.duration(minutes: 45) == "45 min")
        #expect(Format.degrees(20) == "20°")
        #expect(Format.degrees(20.5) == "20.5°")
    }
}
