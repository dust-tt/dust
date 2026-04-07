import SparkleTokens
import SwiftUI

@main
struct DustMobileApp: App {
    @StateObject private var authViewModel = AuthViewModel()

    init() {
        SparkleFonts.registerFonts()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .background(Color.dustBackground.ignoresSafeArea())
                .environmentObject(authViewModel)
                .onOpenURL { url in
                    authViewModel.handleCallbackURL(url)
                }
        }
    }
}
