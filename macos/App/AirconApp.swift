import SwiftUI

@main
struct AirconApp: App {
    @State private var store: AirconStore

    init() {
        let store = AirconStore()
        let arguments = UserDefaults.standard.volatileDomain(forName: UserDefaults.argumentDomain)
        // `-setAddress <url>` saves the Homebridge address, e.g. for testing against a dev bridge.
        if let address = arguments["setAddress"] as? String {
            store.setAddress(address)
        }
        store.start()
        _store = State(initialValue: store)
    }

    var body: some Scene {
        MenuBarExtra {
            PopoverView(store: store)
        } label: {
            MenuBarLabel(store: store)
        }
        .menuBarExtraStyle(.window)

        // `-previewWindow YES` also shows the popover's content in a normal window, for screenshots.
        Window("Aircon Preview", id: "preview") {
            PopoverView(store: store)
        }
        .windowResizability(.contentSize)
        .defaultLaunchBehavior(UserDefaults.standard.bool(forKey: "previewWindow") ? .presented : .suppressed)

        Settings {
            SettingsView(store: store)
        }
    }
}
