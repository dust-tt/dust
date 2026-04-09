import Foundation
import os

private let logger = Logger(subsystem: AppConfig.bundleId, category: "ProjectConversations")

@MainActor
final class ProjectConversationsViewModel: ObservableObject {
    enum State {
        case loading
        case loaded
        case error(String)
    }

    @Published var state: State = .loading
    @Published var conversations: [Conversation] = []
    @Published var searchText: String = ""

    let space: Space
    private let workspaceId: String
    private let tokenProvider: TokenProvider

    init(space: Space, workspaceId: String, tokenProvider: TokenProvider) {
        self.space = space
        self.workspaceId = workspaceId
        self.tokenProvider = tokenProvider
    }

    func load() async {
        state = .loading
        do {
            try await loadConversations()
        } catch {
            logger.error("Failed to load project conversations: \(error)")
            state = .error(error.localizedDescription)
        }
    }

    func refresh() async {
        do {
            try await loadConversations()
        } catch {
            logger.error("Failed to refresh project conversations: \(error)")
        }
    }

    private func loadConversations() async throws {
        let response = try await ConversationService.fetchSpaceConversations(
            workspaceId: workspaceId,
            spaceId: space.sId,
            tokenProvider: tokenProvider
        )
        conversations = response.conversations
        state = .loaded
    }

    var filteredConversations: [Conversation] {
        ConversationGrouping.filtered(conversations, by: searchText)
    }

    var groupedConversations: [(String, [Conversation])] {
        ConversationGrouping.groupedByDate(filteredConversations)
    }
}
