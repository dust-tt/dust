import Foundation
import os

private let logger = Logger(subsystem: AppConfig.bundleId, category: "ConversationList")

enum ConversationDateGroup: String, CaseIterable {
    case today = "Today"
    case yesterday = "Yesterday"
    case lastWeek = "Last Week"
    case lastMonth = "Last Month"
    case last12Months = "Last 12 Months"
    case older = "Older"
}

enum ConversationGrouping {
    static func groupedByDate(_ conversations: [Conversation]) -> [(String, [Conversation])] {
        let calendar = Calendar.current
        let now = Date()
        let startOfToday = calendar.startOfDay(for: now)

        guard let startOfYesterday = calendar.date(byAdding: .day, value: -1, to: startOfToday),
              let startOfLastWeek = calendar.date(byAdding: .day, value: -7, to: startOfToday),
              let startOfLastMonth = calendar.date(byAdding: .month, value: -1, to: startOfToday),
              let startOfLastYear = calendar.date(byAdding: .year, value: -1, to: startOfToday)
        else {
            return [(ConversationDateGroup.today.rawValue, conversations)]
        }

        var groups: [ConversationDateGroup: [Conversation]] = [:]
        for group in ConversationDateGroup.allCases {
            groups[group] = []
        }

        for conversation in conversations {
            let date = conversation.effectiveDate
            if date >= startOfToday {
                groups[.today, default: []].append(conversation)
            } else if date >= startOfYesterday {
                groups[.yesterday, default: []].append(conversation)
            } else if date >= startOfLastWeek {
                groups[.lastWeek, default: []].append(conversation)
            } else if date >= startOfLastMonth {
                groups[.lastMonth, default: []].append(conversation)
            } else if date >= startOfLastYear {
                groups[.last12Months, default: []].append(conversation)
            } else {
                groups[.older, default: []].append(conversation)
            }
        }

        var result: [(String, [Conversation])] = []
        for group in ConversationDateGroup.allCases {
            guard let convos = groups[group], !convos.isEmpty else { continue }
            result.append((group.rawValue, convos))
        }
        return result
    }
}

@MainActor
final class ConversationListViewModel: ObservableObject {
    enum State {
        case loading
        case loaded
        case error(String)
    }

    @Published var state: State = .loading
    @Published var conversations: [Conversation] = []
    @Published var searchText: String = ""
    @Published var workspace: Workspace?
    @Published var workspaces: [Workspace] = []
    @Published var pods: [Space] = []
    @Published var showsAllPods = false
    @Published private var listHasMore = false
    @Published private var searchResults: [Conversation]?
    @Published private var searchHasMore = false
    /// Dust sId of the signed-in user, used to scope tool-approval prompts to their own turns.
    @Published var currentUserSId: String?

    private let tokenProvider: TokenProvider
    private var titleObserver: ConversationTitleObserver?
    private var readObserver: ConversationReadObserver?
    private var hasLoaded = false
    private var listLastValue: String?
    private var searchLastValue: String?
    private var isLoadingMoreConversations = false

    init(tokenProvider: TokenProvider) {
        self.tokenProvider = tokenProvider
        self.titleObserver = ConversationTitleObserver { [weak self] conversationId, title in
            self?.conversations.updateTitle(conversationId: conversationId, title: title)
        }
        self.readObserver = ConversationReadObserver { [weak self] conversationId in
            self?.markConversationsAsRead([conversationId])
        }
    }

    func load() async {
        // Initial load only. The view re-renders into the loading state on every
        // workspace switch, which re-triggers the load `.task`; without this guard
        // that re-fetches /api/user and reverts `workspace` to the session's default,
        // sending us back to the previous workspace's endpoints.
        guard !hasLoaded else { return }
        state = .loading
        do {
            let dustUser = try await AuthService.fetchDustUser(tokenProvider: tokenProvider)
            currentUserSId = dustUser.sId
            workspaces = dustUser.workspaces

            let workspaceId = dustUser.selectedWorkspace ?? dustUser.workspaces.first?.sId
            guard let workspaceId else {
                state = .error("No workspace found")
                return
            }

            workspace = dustUser.workspaces.first { $0.sId == workspaceId }
            async let convosTask: Void = loadConversations()
            async let podsTask: Void = loadPods()
            try await convosTask
            await podsTask
            hasLoaded = true
        } catch {
            logger.error("Failed to load conversations: \(error)")
            state = .error(error.localizedDescription)
        }
    }

    func switchWorkspace(_ newWorkspace: Workspace) async {
        workspace = newWorkspace
        conversations = []
        searchText = ""
        searchResults = nil
        pods = []
        state = .loading
        do {
            async let convosTask: Void = loadConversations()
            async let podsTask: Void = loadPods()
            try await convosTask
            await podsTask
        } catch {
            logger.error("Failed to load conversations: \(error)")
            state = .error(error.localizedDescription)
        }
    }

    func refresh() async {
        do {
            async let convosTask: Void = loadConversations()
            async let podsTask: Void = loadPods()
            try await convosTask
            await podsTask
        } catch {
            logger.error("Failed to refresh conversations: \(error)")
        }
    }

    private func loadConversations() async throws {
        guard let workspaceId = workspace?.sId else { return }
        let response = try await ConversationService.fetchConversations(
            workspaceId: workspaceId,
            tokenProvider: tokenProvider
        )
        conversations = response.conversations
        listHasMore = response.hasMore
        listLastValue = response.lastValue
        state = .loaded
    }

    var hasMoreConversations: Bool {
        searchResults == nil ? listHasMore : searchHasMore
    }

    var isSearching: Bool {
        !searchQuery.isEmpty && searchResults == nil
    }

    private var searchQuery: String {
        searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    func search() async {
        let query = searchQuery
        guard !query.isEmpty, let workspaceId = workspace?.sId else {
            searchResults = nil
            return
        }
        try? await Task.sleep(for: .milliseconds(300))
        guard !Task.isCancelled else { return }
        do {
            let response = try await ConversationService.searchConversations(
                workspaceId: workspaceId,
                query: query,
                tokenProvider: tokenProvider
            )
            guard !Task.isCancelled else { return }
            searchResults = response.conversations
            searchHasMore = response.hasMore
            searchLastValue = response.lastValue
        } catch {
            logger.error("Failed to search conversations: \(error)")
        }
    }

    func loadMoreConversations() async {
        guard hasMoreConversations, !isLoadingMoreConversations, let workspaceId = workspace?.sId else { return }
        isLoadingMoreConversations = true
        defer { isLoadingMoreConversations = false }
        do {
            if searchResults != nil {
                let response = try await ConversationService.searchConversations(
                    workspaceId: workspaceId,
                    query: searchQuery,
                    tokenProvider: tokenProvider,
                    lastValue: searchLastValue
                )
                searchResults? += response.conversations
                searchHasMore = response.hasMore
                searchLastValue = response.lastValue
            } else {
                let response = try await ConversationService.fetchConversations(
                    workspaceId: workspaceId,
                    tokenProvider: tokenProvider,
                    lastValue: listLastValue
                )
                conversations += response.conversations
                listHasMore = response.hasMore
                listLastValue = response.lastValue
            }
        } catch {
            logger.error("Failed to load more conversations: \(error)")
        }
    }

    private func loadPods() async {
        guard let workspaceId = workspace?.sId else { return }
        do {
            pods = try await SpaceService.fetchPods(
                workspaceId: workspaceId,
                tokenProvider: tokenProvider
            )
        } catch {
            logger.error("Failed to load pods: \(error)")
        }
    }

    func markConversationsAsRead(_ ids: Set<String>) {
        for id in ids {
            setReadState(conversationId: id, unread: false, actionRequired: false)
        }
    }

    private func setReadState(conversationId: String, unread: Bool, actionRequired: Bool) {
        for index in conversations.indices where conversations[index].sId == conversationId {
            conversations[index].unread = unread
            conversations[index].actionRequired = actionRequired
        }
        for index in (searchResults ?? []).indices where searchResults?[index].sId == conversationId {
            searchResults?[index].unread = unread
            searchResults?[index].actionRequired = actionRequired
        }
    }

    func toggleReadStatus(for conversation: Conversation) async {
        guard let workspaceId = workspace?.sId else { return }

        // Optimistically update local state.
        let wasUnread = conversation.unread || conversation.actionRequired
        setReadState(conversationId: conversation.sId, unread: !wasUnread, actionRequired: false)

        do {
            if wasUnread {
                try await ConversationService.markAsRead(
                    workspaceId: workspaceId,
                    conversationId: conversation.sId,
                    tokenProvider: tokenProvider
                )
            } else {
                try await ConversationService.markAsUnread(
                    workspaceId: workspaceId,
                    conversationId: conversation.sId,
                    tokenProvider: tokenProvider
                )
            }
        } catch {
            // Revert on failure.
            logger.error("Failed to toggle read status: \(error)")
            setReadState(
                conversationId: conversation.sId,
                unread: conversation.unread,
                actionRequired: conversation.actionRequired
            )
        }
    }

    func deleteConversation(_ conversation: Conversation) async {
        guard let workspaceId = workspace?.sId else { return }

        // Optimistically remove from local state.
        let snapshot = conversations
        let searchSnapshot = searchResults
        conversations.removeAll { $0.sId == conversation.sId }
        searchResults?.removeAll { $0.sId == conversation.sId }

        do {
            try await ConversationService.deleteConversation(
                workspaceId: workspaceId,
                conversationId: conversation.sId,
                tokenProvider: tokenProvider
            )
        } catch {
            // Revert on failure.
            logger.error("Failed to delete conversation: \(error)")
            conversations = snapshot
            searchResults = searchSnapshot
        }
    }

    var unreadConversations: [Conversation] {
        conversations.filter { $0.unread || $0.actionRequired }
    }

    var filteredConversations: [Conversation] {
        searchQuery.isEmpty ? conversations : searchResults ?? []
    }

    var inboxConversations: [Conversation] {
        filteredConversations.filter { $0.unread || $0.actionRequired }
    }

    var groupedConversations: [(String, [Conversation])] {
        ConversationGrouping.groupedByDate(filteredConversations.filter { !$0.unread && !$0.actionRequired })
    }

    func podJoined() async {
        await loadPods()
    }
}
