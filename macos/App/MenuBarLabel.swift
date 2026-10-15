import SwiftUI

/// The menu bar item, kept compact: the running mode's symbol, the setpoint while heating or cooling, and a moon while
/// the sleep timer runs, e.g. "❄ 20° ☾". Off is a quiet aircon outline.
///
/// A menu bar item shows one image and one title, so the parts are drawn into a template image, which macOS tints for
/// light, dark and coloured menu bars.
struct MenuBarLabel: View {
    let store: AirconStore
    @Environment(\.displayScale) private var displayScale

    var body: some View {
        Image(nsImage: Self.render(content, scale: displayScale))
            .accessibilityLabel(accessibilityText)
    }

    private var unit: AirconStatus.Unit? {
        store.isStale ? nil : store.status?.aircon
    }

    private var content: some View {
        HStack(spacing: 3) {
            if let unit, unit.power {
                Image(systemName: unit.mode.symbol)
                if unit.mode.usesSetpoint {
                    Text(Format.degrees(unit.setTemp))
                }
                if unit.offCountdown > 0 {
                    Image(systemName: "moon.fill")
                        .font(.system(size: 10, weight: .semibold))
                }
            } else if store.status == nil || store.isStale {
                Image(systemName: "air.conditioner.horizontal")
                Image(systemName: "exclamationmark")
                    .font(.system(size: 10, weight: .bold))
            } else {
                Image(systemName: "air.conditioner.horizontal")
                    .opacity(0.55)
            }
        }
        .font(.system(size: 13, weight: .medium))
        .monospacedDigit()
        .foregroundStyle(.black)
        .fixedSize()
    }

    private var accessibilityText: Text {
        guard let unit else {
            return Text("Aircon, not connected")
        }
        guard unit.power else {
            return Text("Aircon off")
        }
        let timer = unit.offCountdown > 0 ? String(localized: ", off in \(Format.duration(minutes: unit.offCountdown))") : ""
        return Text("Aircon \(unit.mode.runningText(setTemp: unit.setTemp))\(timer)")
    }

    private static func render(_ content: some View, scale: CGFloat) -> NSImage {
        let renderer = ImageRenderer(content: content)
        renderer.scale = max(scale, 1)
        let image = renderer.nsImage ?? NSImage()
        image.isTemplate = true
        return image
    }
}
