import Foundation
import os

private let logger = Logger(subsystem: AppConfig.bundleId, category: "CatchUp")

@MainActor
final class CatchUpViewModel: ObservableObject {
    @Published var currentIndex = 0
    @Published var messages: [ConversationMessage] = []
    @Published var isLoadingMessages = false

    let conversations: [Conversation]
    private let workspaceId: String
    private let tokenProvider: TokenProvider
    private(set) var markedAsReadIds: Set<String> = []
    private var loadTask: Task<Void, Never>?
    private var hasFlushed = false

    init(conversations: [Conversation], workspaceId: String, tokenProvider: TokenProvider) {
        self.conversations = conversations
        self.workspaceId = workspaceId
        self.tokenProvider = tokenProvider
    }

    var currentConversation: Conversation? {
        guard currentIndex < conversations.count else { return nil }
        return conversations[currentIndex]
    }

    var isDone: Bool {
        currentIndex >= conversations.count
    }

    var progressText: String {
        "\(min(currentIndex + 1, conversations.count)) of \(conversations.count)"
    }

    func loadCurrentMessages() async {
        guard let conversation = currentConversation else { return }
        let expectedIndex = currentIndex
        isLoadingMessages = true
        messages = []
        do {
            let response = try await ConversationService.fetchMessages(
                workspaceId: workspaceId,
                conversationId: conversation.sId,
                tokenProvider: tokenProvider,
                limit: 10
            )
            guard currentIndex == expectedIndex else { return }
            messages = response.messages.sorted(by: ConversationMessage.byRank)
        } catch {
            logger.error("Failed to load messages for catch-up: \(error)")
        }
        isLoadingMessages = false
    }

    func markAsRead() {
        guard let conversation = currentConversation else { return }
        markedAsReadIds.insert(conversation.sId)
        advance()
    }

    func keepForLater() {
        advance()
    }

    func flush() async {
        guard !hasFlushed, !markedAsReadIds.isEmpty else { return }
        hasFlushed = true
        let ids = Array(markedAsReadIds)
        do {
            try await ConversationService.bulkMarkAsRead(
                workspaceId: workspaceId,
                conversationIds: ids,
                tokenProvider: tokenProvider
            )
        } catch {
            hasFlushed = false
            logger.error("Failed to bulk mark as read: \(error)")
        }
    }

    private func advance() {
        currentIndex += 1
        loadTask?.cancel()
        if isDone {
            Task { await flush() }
        } else {
            loadTask = Task { await loadCurrentMessages() }
        }
    }
}
