import Foundation

@MainActor
@Observable
class ConversationListViewModel {
    var conversations: [ConversationWithoutContent] = []
    var isLoading = false
    var error: String?

    @ObservationIgnored private let appState: AppState

    init(appState: AppState) {
        self.appState = appState
    }

    func loadConversations() async {
        guard let workspaceId = appState.workspaceId else { return }

        isLoading = true
        error = nil

        do {
            conversations = try await appState.apiClient.getConversations(
                domain: appState.domain,
                workspaceId: workspaceId
            )
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    func refresh() async {
        await loadConversations()
    }
}
