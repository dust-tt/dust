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
    @Published private var listHasMore = false
    @Published private var searchResults: [Conversation]?

    let space: Space
    private let workspaceId: String
    private let tokenProvider: TokenProvider
    private var titleObserver: ConversationTitleObserver?
    private var lastValue: String?
    private var isLoadingMore = false

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
        conversations = response.conversations.map(Conversation.init(podItem:))
        listHasMore = response.hasMore
        lastValue = response.lastValue
        state = .loaded
    }

    var hasMore: Bool {
        searchQuery.isEmpty && listHasMore
    }

    var isSearching: Bool {
        !searchQuery.isEmpty && searchResults == nil
    }

    private var searchQuery: String {
        searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    func search() async {
        let query = searchQuery
        guard !query.isEmpty else {
            searchResults = nil
            return
        }
        try? await Task.sleep(for: .milliseconds(300))
        guard !Task.isCancelled else { return }
        do {
            let results = try await ConversationService.searchSpaceConversations(
                workspaceId: workspaceId,
                spaceId: space.sId,
                query: query,
                tokenProvider: tokenProvider
            )
            guard !Task.isCancelled else { return }
            searchResults = results
        } catch {
            logger.error("Failed to search pod conversations: \(error)")
        }
    }

    func loadMore() async {
        guard hasMore, !isLoadingMore else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let response = try await ConversationService.fetchSpaceConversations(
                workspaceId: workspaceId,
                spaceId: space.sId,
                tokenProvider: tokenProvider,
                lastValue: lastValue
            )
            conversations += response.conversations.map(Conversation.init(podItem:))
            listHasMore = response.hasMore
            lastValue = response.lastValue
        } catch {
            logger.error("Failed to load more pod conversations: \(error)")
        }
    }

    var filteredConversations: [Conversation] {
        searchQuery.isEmpty ? conversations : searchResults ?? []
    }

    var groupedConversations: [(String, [Conversation])] {
        ConversationGrouping.groupedByDate(filteredConversations)
    }
}
