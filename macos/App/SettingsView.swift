import ServiceManagement
import SwiftUI

struct SettingsView: View {
    let store: AirconStore
    @State private var address = ""
    @State private var openAtLogin = SMAppService.mainApp.status == .enabled
    @State private var loginError: String?

    var body: some View {
        Form {
            Section {
                TextField("Homebridge address", text: $address, prompt: Text(AirconStore.defaultAddress))
                    .onSubmit(save)
                HStack {
                    connectionLabel
                    Spacer()
                    Button("Use Default") {
                        address = AirconStore.defaultAddress
                        save()
                    }
                    Button("Save", action: save)
                        .keyboardShortcut(.defaultAction)
                }
            } header: {
                Text("Connection")
            } footer: {
                Text("In Homebridge, open the e-zone plugin's settings and turn on **Mac app**. The address is your Homebridge's IP address and that port, normally 8583.")
                    .foregroundStyle(.secondary)
            }

            Section("General") {
                Toggle("Open at login", isOn: $openAtLogin)
                    .onChange(of: openAtLogin) { _, enabled in
                        setOpenAtLogin(enabled)
                    }
                if let loginError {
                    Text(loginError)
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            }
        }
        .formStyle(.grouped)
        .frame(width: 440)
        .fixedSize(horizontal: false, vertical: true)
        .onAppear { address = store.address }
    }

    @ViewBuilder
    private var connectionLabel: some View {
        if store.status != nil && !store.isStale {
            Label("Connected", systemImage: "checkmark.circle.fill")
                .foregroundStyle(.green)
        } else if let problem = store.problem {
            Label(problem, systemImage: "exclamationmark.triangle.fill")
                .foregroundStyle(.orange)
                .lineLimit(2)
        } else {
            Label("Connecting…", systemImage: "ellipsis.circle")
                .foregroundStyle(.secondary)
        }
    }

    private func save() {
        store.setAddress(address)
    }

    private func setOpenAtLogin(_ enabled: Bool) {
        do {
            if enabled {
                try SMAppService.mainApp.register()
            } else {
                try SMAppService.mainApp.unregister()
            }
            loginError = nil
        } catch {
            loginError = error.localizedDescription
            openAtLogin = SMAppService.mainApp.status == .enabled
        }
    }
}
