import Foundation
import os

private let logger = Logger(subsystem: AppConfig.bundleId, category: "PodConversations")

@MainActor
final class PodConversationsViewModel: ObservableObject {
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
    private var titleObserver: ConversationTitleObserver?

    init(space: Space, workspaceId: String, tokenProvider: TokenProvider) {
        self.space = space
        self.workspaceId = workspaceId
        self.tokenProvider = tokenProvider
        self.titleObserver = ConversationTitleObserver { [weak self] conversationId, title in
            self?.conversations.updateTitle(conversationId: conversationId, title: title)
        }
    }

    func load() async {
        state = .loading
        do {
            try await loadConversations()
        } catch {
            logger.error("Failed to load pod conversations: \(error)")
            state = .error(error.localizedDescription)
        }
    }

    func refresh() async {
        do {
            try await loadConversations()
        } catch {
            logger.error("Failed to refresh pod conversations: \(error)")
        }
    }

    private func loadConversations() async throws {
        let response = try await ConversationService.fetchSpaceConversations(
            workspaceId: workspaceId,
            spaceId: space.sId,
            tokenProvider: tokenProvider
        )
        // Hide conversations without a visible first message (e.g. compaction-only), as front does.
        conversations = response.conversations.filter { $0.preview != nil }
        state = .loaded
    }

    var filteredConversations: [Conversation] {
        ConversationGrouping.filtered(conversations, by: searchText)
    }

    var groupedConversations: [(String, [Conversation])] {
        ConversationGrouping.groupedByDate(filteredConversations)
    }
}
