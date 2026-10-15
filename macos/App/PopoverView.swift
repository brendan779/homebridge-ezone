import SwiftUI

/// The popover: power and status, mode, setpoint, fan speed, sleep timer and the zones.
///
/// Liquid Glass is kept for controls (mode chips, round buttons, the sleep timer) as Apple's guidelines ask; content
/// such as the setpoint and zone tiles sits on quiet fills so glass never stacks on glass.
struct PopoverView: View {
    let store: AirconStore

    var body: some View {
        VStack(spacing: 14) {
            if let status = store.status, let unit = status.aircon {
                HeaderView(store: store, unit: unit)
                if !unit.errorCode.isEmpty {
                    FaultBanner(code: unit.errorCode)
                }
                ModePicker(store: store, unit: unit)
                SetpointView(store: store, unit: unit)
                FanSpeedView(store: store, unit: unit)
                SleepTimerButton(store: store, unit: unit, minutes: status.sleepTimerMinutes)
                ZonesView(store: store, status: status, unit: unit)
            } else {
                ConnectingView(problem: store.problem)
            }
            FooterView(store: store)
        }
        .padding(16)
        .frame(width: 340)
        .focusEffectDisabled()
        .background(alignment: .top) { AmbientGlow(unit: store.status?.aircon) }
        .animation(.smooth(duration: 0.35), value: store.status)
        .onAppear { store.isShowing = true }
        .onDisappear { store.isShowing = false }
    }
}

/// A soft wash of the running mode's colour behind the top of the popover.
private struct AmbientGlow: View {
    let unit: AirconStatus.Unit?

    var body: some View {
        let tint = unit?.power == true ? unit!.mode.tint : .clear
        LinearGradient(colors: [tint.opacity(0.28), tint.opacity(0.08), .clear], startPoint: .top, endPoint: .bottom)
            .frame(height: 260)
            .allowsHitTesting(false)
            .ignoresSafeArea()
    }
}

// MARK: Header

private struct HeaderView: View {
    let store: AirconStore
    let unit: AirconStatus.Unit

    var body: some View {
        HStack(spacing: 12) {
            ModeGlyph(mode: unit.mode, active: unit.power)
            VStack(alignment: .leading, spacing: 2) {
                Text("Air Conditioner")
                    .font(.headline)
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .contentTransition(.numericText())
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            Toggle("Power", isOn: Binding(get: { unit.power }, set: { store.setPower($0) }))
                .toggleStyle(.switch)
                .labelsHidden()
                .tint(unit.mode.tint)
        }
    }

    /// The sleep timer has its own row, so the subtitle stays short enough for one line.
    private var subtitle: String {
        unit.power ? unit.mode.runningText(setTemp: unit.setTemp) : String(localized: "Off")
    }
}

/// The mode's symbol in a round well: a gradient of the mode colour while running, quiet grey when off.
private struct ModeGlyph: View {
    let mode: Mode
    let active: Bool

    var body: some View {
        ZStack {
            Circle()
                .fill(active
                      ? AnyShapeStyle(LinearGradient(colors: [mode.tint.mix(with: .white, by: 0.25), mode.tint],
                                                     startPoint: .top, endPoint: .bottom))
                      : AnyShapeStyle(.quaternary))
                .shadow(color: active ? mode.tint.opacity(0.45) : .clear, radius: 8, y: 3)
            Image(systemName: mode.symbol)
                .font(.system(size: 19, weight: .semibold))
                .foregroundStyle(active ? .white : .secondary)
                .contentTransition(.symbolEffect(.replace))
                .symbolEffect(.rotate, options: .repeat(.continuous).speed(0.6), isActive: active && mode == .vent)
                .symbolEffect(.breathe.pulse, options: .repeat(.continuous).speed(0.4), isActive: active && mode != .vent)
        }
        .frame(width: 44, height: 44)
    }
}

private struct FaultBanner: View {
    let code: String

    var body: some View {
        Label("The aircon reports fault \(code). Check the e-zone tablet.", systemImage: "exclamationmark.triangle.fill")
            .font(.callout)
            .foregroundStyle(.orange)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(10)
            .background(.orange.opacity(0.12), in: .rect(cornerRadius: 12))
    }
}

// MARK: Mode

private struct ModePicker: View {
    let store: AirconStore
    let unit: AirconStatus.Unit

    var body: some View {
        GlassEffectContainer(spacing: 6) {
            HStack(spacing: 6) {
                ForEach(Mode.allCases) { mode in
                    let selected = mode == unit.mode
                    Button {
                        store.setMode(mode)
                    } label: {
                        VStack(spacing: 4) {
                            Image(systemName: mode.symbol)
                                .font(.system(size: 15, weight: .semibold))
                                .frame(height: 18)
                            Text(mode.title)
                                .font(.caption.weight(.medium))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 9)
                        .foregroundStyle(selected ? AnyShapeStyle(.white) : AnyShapeStyle(.primary))
                        .contentShape(.rect(cornerRadius: 14))
                    }
                    .buttonStyle(.plain)
                    .glassEffect(selected ? .regular.tint(mode.tint.opacity(unit.power ? 1 : 0.55)).interactive() : .regular.interactive(),
                                 in: .rect(cornerRadius: 14))
                    .accessibilityAddTraits(selected ? .isSelected : [])
                    .help(unit.power ? Text("Switch to \(Text(mode.title))") : Text("Start in \(Text(mode.title)) next time"))
                }
            }
        }
    }
}

// MARK: Setpoint

private struct SetpointView: View {
    let store: AirconStore
    let unit: AirconStatus.Unit

    var body: some View {
        HStack {
            StepButton(symbol: "minus", label: "Cooler") { store.nudgeTemperature(by: -1) }
            Spacer()
            VStack(spacing: 0) {
                Text(caption)
                    .font(.caption.weight(.semibold))
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                Text(Format.degrees(unit.setTemp))
                    .font(.system(size: 54, weight: .light, design: .rounded))
                    .monospacedDigit()
                    .contentTransition(.numericText(value: unit.setTemp))
                    .foregroundStyle(unit.mode.usesSetpoint ? AnyShapeStyle(.primary) : AnyShapeStyle(.tertiary))
            }
            Spacer()
            StepButton(symbol: "plus", label: "Warmer") { store.nudgeTemperature(by: 1) }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(.fill.quinary, in: .rect(cornerRadius: 20))
    }

    private var caption: LocalizedStringKey {
        switch unit.mode {
        case .cool: "Cool to"
        case .heat: "Heat to"
        case .vent, .dry: "Setpoint"
        }
    }
}

private struct StepButton: View {
    let symbol: String
    let label: LocalizedStringKey
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 15, weight: .bold))
                .frame(width: 30, height: 30)
        }
        .buttonStyle(.glass)
        .buttonBorderShape(.circle)
        .accessibilityLabel(Text(label))
        .buttonRepeatBehavior(.enabled)
    }
}

// MARK: Fan speed

private struct FanSpeedView: View {
    let store: AirconStore
    let unit: AirconStatus.Unit

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label("Fan speed", systemImage: "fan")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            Picker("Fan speed", selection: Binding(get: { unit.fan }, set: { store.setFan($0) })) {
                ForEach(FanSpeed.allCases) { speed in
                    Text(speed.title).tag(speed)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .tint(unit.mode.tint)
        }
    }
}

// MARK: Sleep timer

private struct SleepTimerButton: View {
    let store: AirconStore
    let unit: AirconStatus.Unit
    let minutes: Int

    private var running: Bool { unit.power && unit.offCountdown > 0 }

    var body: some View {
        Button {
            store.setSleepTimer(!running)
        } label: {
            HStack(spacing: 10) {
                Image(systemName: running ? "moon.zzz.fill" : "moon.zzz")
                    .font(.system(size: 17, weight: .semibold))
                    .contentTransition(.symbolEffect(.replace))
                    .frame(width: 24)
                VStack(alignment: .leading, spacing: 1) {
                    Text("Sleep timer")
                        .font(.callout.weight(.semibold))
                    Text(detail)
                        .font(.caption)
                        .opacity(0.75)
                        .contentTransition(.numericText())
                }
                Spacer()
                if running {
                    CountdownRing(fraction: Double(unit.offCountdown) / Double(max(minutes, unit.offCountdown)))
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .bold))
                        .opacity(0.8)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 4)
            .padding(.horizontal, 2)
        }
        .buttonStyle(running ? AnyPrimitiveButtonStyle(.glassProminent) : AnyPrimitiveButtonStyle(.glass))
        .buttonBorderShape(.roundedRectangle(radius: 16))
        .tint(Color(red: 0.36, green: 0.34, blue: 0.86))
        .disabled(!unit.power)
        .help(running ? Text("Cancel the sleep timer") : Text("Turn the aircon off in \(Format.duration(minutes: minutes))"))
    }

    private var detail: String {
        if running {
            return String(localized: "Off in \(Format.duration(minutes: unit.offCountdown))")
        }
        return unit.power
            ? String(localized: "Turn off in \(Format.duration(minutes: minutes))")
            : String(localized: "Turn the aircon on first")
    }
}

/// Time left on the sleep timer as a ring that empties.
private struct CountdownRing: View {
    let fraction: Double

    var body: some View {
        ZStack {
            Circle()
                .stroke(.white.opacity(0.25), lineWidth: 3)
            Circle()
                .trim(from: 0, to: fraction)
                .stroke(.white, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                .rotationEffect(.degrees(-90))
        }
        .frame(width: 18, height: 18)
        .animation(.smooth, value: fraction)
    }
}

/// Lets the sleep timer switch between the glass and prominent-glass styles.
private struct AnyPrimitiveButtonStyle: PrimitiveButtonStyle {
    private let make: (Configuration) -> AnyView

    init<S: PrimitiveButtonStyle>(_ style: S) {
        make = { AnyView(style.makeBody(configuration: $0)) }
    }

    func makeBody(configuration: Configuration) -> some View {
        make(configuration)
    }
}

// MARK: Zones

private struct ZonesView: View {
    let store: AirconStore
    let status: AirconStatus
    let unit: AirconStatus.Unit

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text("Zones")
                    .font(.headline)
                Spacer()
                Text("\(status.openZones) of \(status.zones.count) open")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .contentTransition(.numericText())
            }
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                ForEach(status.zones) { zone in
                    ZoneTile(store: store, zone: zone, tint: unit.power ? unit.mode.tint : Color(white: 0.6), airflow: unit.power)
                }
            }
        }
    }
}

/// Click to open or close; hover an open zone for damper arrows (5 % a step).
private struct ZoneTile: View {
    let store: AirconStore
    let zone: AirconStatus.Zone
    let tint: Color
    let airflow: Bool
    @State private var hovering = false

    var body: some View {
        Button {
            store.setZone(zone.id, open: !zone.open)
        } label: {
            HStack(spacing: 9) {
                Image(systemName: "wind")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(zone.open ? AnyShapeStyle(tint) : AnyShapeStyle(.tertiary))
                    .symbolEffect(.variableColor.iterative.dimInactiveLayers, options: .repeat(.continuous).speed(0.5),
                                  isActive: zone.open && airflow)
                    .frame(width: 20)
                VStack(alignment: .leading, spacing: 1) {
                    Text(zone.name)
                        .font(.callout.weight(.medium))
                        .lineLimit(1)
                    Text(zone.open ? "\(zone.damper)%" : String(localized: "Off"))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                        .contentTransition(.numericText(value: Double(zone.damper)))
                }
                Spacer(minLength: 0)
            }
            .padding(.leading, 10)
            .padding(.trailing, 6)
            .frame(height: 50)
            .frame(maxWidth: .infinity)
            .background(alignment: .bottomLeading) {
                if zone.open {
                    GeometryReader { proxy in
                        Capsule()
                            .fill(tint.opacity(0.7))
                            .frame(width: max(6, (proxy.size.width - 20) * Double(zone.damper) / 100), height: 3)
                            .offset(x: 10, y: proxy.size.height - 7)
                    }
                }
            }
            .background(zone.open ? AnyShapeStyle(tint.opacity(0.14)) : AnyShapeStyle(.fill.quinary), in: .rect(cornerRadius: 14))
            .overlay {
                RoundedRectangle(cornerRadius: 14)
                    .strokeBorder(zone.open ? tint.opacity(0.35) : .primary.opacity(0.06), lineWidth: 1)
            }
            .contentShape(.rect(cornerRadius: 14))
        }
        .buttonStyle(.plain)
        .overlay(alignment: .trailing) {
            if hovering && zone.open {
                VStack(spacing: 2) {
                    DamperArrow(symbol: "chevron.up", label: "Open more") { store.nudgeDamper(zone.id, by: 5) }
                    DamperArrow(symbol: "chevron.down", label: "Open less") { store.nudgeDamper(zone.id, by: -5) }
                }
                .padding(.trailing, 6)
                .transition(.opacity.combined(with: .scale(scale: 0.8)))
            }
        }
        .onHover { inside in
            withAnimation(.snappy(duration: 0.18)) { hovering = inside }
        }
        .help(zone.constant ? Text("\(zone.name) is a constant zone") : Text(zone.open ? "Close \(zone.name)" : "Open \(zone.name)"))
        .accessibilityValue(zone.open ? Text("Open, \(zone.damper) percent") : Text("Closed"))
    }
}

private struct DamperArrow: View {
    let symbol: String
    let label: LocalizedStringKey
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 9, weight: .bold))
                .frame(width: 20, height: 16)
        }
        .buttonStyle(.glass)
        .buttonBorderShape(.capsule)
        .controlSize(.mini)
        .accessibilityLabel(Text(label))
    }
}

// MARK: Connecting and footer

private struct ConnectingView: View {
    let problem: String?

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: problem == nil ? "air.conditioner.horizontal" : "wifi.exclamationmark")
                .font(.system(size: 34, weight: .light))
                .foregroundStyle(.secondary)
                .symbolEffect(.pulse, options: .repeat(.continuous), isActive: problem == nil)
            Text(problem == nil ? "Connecting to Homebridge…" : "Can't reach the aircon")
                .font(.headline)
            if let problem {
                Text(problem)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                SettingsLink {
                    Text("Open Settings")
                }
                .buttonStyle(.glass)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
    }
}

private struct FooterView: View {
    let store: AirconStore

    var body: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(store.isStale ? Color.orange : Color.green)
                .frame(width: 6, height: 6)
            TimelineView(.periodic(from: .now, by: 5)) { context in
                Text(statusText(now: context.date))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer()
            SettingsLink {
                Image(systemName: "gearshape")
            }
            .buttonStyle(.glass)
            .buttonBorderShape(.circle)
            .controlSize(.small)
            .help("Settings")
            Button {
                NSApp.terminate(nil)
            } label: {
                Image(systemName: "power")
            }
            .buttonStyle(.glass)
            .buttonBorderShape(.circle)
            .controlSize(.small)
            .help("Quit Aircon")
        }
    }

    private func statusText(now: Date) -> String {
        if let problem = store.problem, store.status != nil {
            return problem
        }
        guard let last = store.lastReading else {
            return String(localized: "Waiting for Homebridge")
        }
        let seconds = Int(now.timeIntervalSince(last))
        return seconds < 10 ? String(localized: "Up to date") : String(localized: "Updated \(Format.duration(minutes: max(1, seconds / 60))) ago")
    }
}

#Preview {
    PopoverView(store: AirconStore())
}
