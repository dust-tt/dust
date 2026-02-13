import Foundation

@MainActor
class AppState: ObservableObject {
    let authService: AuthService
    let apiClient: DustAPIClient

    init() {
        let auth = AuthService()
        self.authService = auth
        self.apiClient = DustAPIClient(authService: auth)
    }

    var domain: String {
        authService.currentUser?.dustDomain ?? DustConfig.defaultDomain
    }

    var workspaceId: String? {
        authService.currentUser?.currentWorkspace?.sId
    }
}
