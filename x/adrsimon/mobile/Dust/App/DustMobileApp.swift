import SwiftUI

@main
struct DustMobileApp: App {
    @StateObject private var authViewModel = AuthViewModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(authViewModel)
                .onOpenURL { url in
                    authViewModel.handleCallbackURL(url)
                }
        }
    }
}
