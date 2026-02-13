import Foundation

@MainActor
class AuthViewModel: ObservableObject {
    @Published var isLoggingIn = false

    private let authService: AuthService

    init(authService: AuthService) {
        self.authService = authService
    }

    func login() async {
        isLoggingIn = true
        await authService.login()
        isLoggingIn = false
    }

    func selectWorkspace(_ workspaceId: String) async {
        await authService.selectWorkspace(workspaceId)
    }

    func logout() async {
        await authService.logout()
    }
}
