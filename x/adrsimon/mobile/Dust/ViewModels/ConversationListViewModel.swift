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

    private let accessToken: String

    init(accessToken: String) {
        self.accessToken = accessToken
    }

    func load() async {
        state = .loading
        do {
            let dustUser = try await AuthService.fetchDustUser(accessToken: accessToken)
            workspaces = dustUser.workspaces

            let workspaceSId = dustUser.selectedWorkspace ?? dustUser.workspaces.first?.sId
            guard let workspaceSId else {
                state = .error("No workspace found")
                return
            }

            workspace = dustUser.workspaces.first { $0.sId == workspaceSId }
            try await loadConversations()
        } catch {
            logger.error("Failed to load conversations: \(error)")
            state = .error(error.localizedDescription)
        }
    }

    func switchWorkspace(_ newWorkspace: Workspace) async {
        workspace = newWorkspace
        conversations = []
        state = .loading
        do {
            try await loadConversations()
        } catch {
            logger.error("Failed to load conversations: \(error)")
            state = .error(error.localizedDescription)
        }
    }

    func refresh() async {
        do {
            try await loadConversations()
        } catch {
            logger.error("Failed to refresh conversations: \(error)")
        }
    }

    private func loadConversations() async throws {
        guard let workspaceSId = workspace?.sId else { return }
        let response = try await ConversationService.fetchConversations(
            workspaceId: workspaceSId,
            accessToken: accessToken
        )
        conversations = response.conversations
        state = .loaded
    }

    var filteredConversations: [Conversation] {
        guard !searchText.isEmpty else { return conversations }
        let query = searchText.lowercased()
        return conversations.filter { conversation in
            guard let title = conversation.title else { return false }
            return title.lowercased().contains(query)
        }
    }

    var groupedConversations: [(String, [Conversation])] {
        let calendar = Calendar.current
        let now = Date()
        let startOfToday = calendar.startOfDay(for: now)
        let filtered = filteredConversations

        guard let startOfYesterday = calendar.date(byAdding: .day, value: -1, to: startOfToday),
              let startOfLastWeek = calendar.date(byAdding: .day, value: -7, to: startOfToday),
              let startOfLastMonth = calendar.date(byAdding: .month, value: -1, to: startOfToday),
              let startOfLastYear = calendar.date(byAdding: .year, value: -1, to: startOfToday)
        else {
            return [(ConversationDateGroup.today.rawValue, filtered)]
        }

        var groups: [ConversationDateGroup: [Conversation]] = [:]
        for group in ConversationDateGroup.allCases {
            groups[group] = []
        }

        for conversation in filtered {
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

        // Inbox section: unread or actionRequired conversations, shown first.
        let inboxConversations = filtered.filter { $0.unread || $0.actionRequired }
        if !inboxConversations.isEmpty {
            result.append(("Inbox (\(inboxConversations.count))", inboxConversations))
        }

        let inboxIds = Set(inboxConversations.map(\.sId))
        for group in ConversationDateGroup.allCases {
            guard let convos = groups[group], !convos.isEmpty else { continue }
            let filtered = convos.filter { !inboxIds.contains($0.sId) }
            if !filtered.isEmpty {
                result.append((group.rawValue, filtered))
            }
        }

        return result
    }
}
