import SwiftUI

@main
struct DustHiveCatApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        // We manage our own windows, so just provide empty Settings
        Settings {
            EmptyView()
        }
    }
}
