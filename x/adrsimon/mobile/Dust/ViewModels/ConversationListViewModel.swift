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
    static func filtered(_ conversations: [Conversation], by searchText: String) -> [Conversation] {
        guard !searchText.isEmpty else { return conversations }
        let query = searchText.lowercased()
        return conversations.filter { conversation in
            guard let title = conversation.title else { return false }
            return title.lowercased().contains(query)
        }
    }

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
    @Published var projects: [Space] = []
    @Published var isProjectsExpanded: Bool = true

    private let tokenProvider: TokenProvider

    init(tokenProvider: TokenProvider) {
        self.tokenProvider = tokenProvider
    }

    func load() async {
        state = .loading
        do {
            let dustUser = try await AuthService.fetchDustUser(tokenProvider: tokenProvider)
            workspaces = dustUser.workspaces

            let workspaceId = dustUser.selectedWorkspace ?? dustUser.workspaces.first?.sId
            guard let workspaceId else {
                state = .error("No workspace found")
                return
            }

            workspace = dustUser.workspaces.first { $0.sId == workspaceId }
            async let convosTask: Void = loadConversations()
            async let projectsTask: Void = loadProjects()
            try await convosTask
            await projectsTask
        } catch {
            logger.error("Failed to load conversations: \(error)")
            state = .error(error.localizedDescription)
        }
    }

    func switchWorkspace(_ newWorkspace: Workspace) async {
        workspace = newWorkspace
        conversations = []
        projects = []
        state = .loading
        do {
            async let convosTask: Void = loadConversations()
            async let projectsTask: Void = loadProjects()
            try await convosTask
            await projectsTask
        } catch {
            logger.error("Failed to load conversations: \(error)")
            state = .error(error.localizedDescription)
        }
    }

    func refresh() async {
        do {
            async let convosTask: Void = loadConversations()
            async let projectsTask: Void = loadProjects()
            try await convosTask
            await projectsTask
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
        state = .loaded
    }

    private func loadProjects() async {
        guard let workspaceId = workspace?.sId else { return }
        do {
            projects = try await SpaceService.fetchProjects(
                workspaceId: workspaceId,
                tokenProvider: tokenProvider
            )
        } catch {
            logger.error("Failed to load projects: \(error)")
        }
    }

    func markConversationsAsRead(_ ids: Set<String>) {
        for index in conversations.indices where ids.contains(conversations[index].sId) {
            conversations[index].unread = false
            conversations[index].actionRequired = false
        }
    }

    var unreadConversations: [Conversation] {
        conversations.filter { $0.unread || $0.actionRequired }
    }

    var filteredConversations: [Conversation] {
        ConversationGrouping.filtered(conversations, by: searchText)
    }

    var groupedConversations: [(String, [Conversation])] {
        let filtered = filteredConversations
        let dateGroups = ConversationGrouping.groupedByDate(filtered)

        // Prepend Inbox section: unread or actionRequired conversations.
        let inboxIds = Set(unreadConversations.map(\.sId))
        let inboxConversations = filtered.filter { inboxIds.contains($0.sId) }
        guard !inboxConversations.isEmpty else { return dateGroups }

        var result: [(String, [Conversation])] = [("Inbox (\(inboxConversations.count))", inboxConversations)]
        for (label, convos) in dateGroups {
            let nonInbox = convos.filter { !inboxIds.contains($0.sId) }
            if !nonInbox.isEmpty {
                result.append((label, nonInbox))
            }
        }
        return result
    }
}
