import Foundation
import os

private let logger = Logger(subsystem: "com.dust.mobile", category: "ConversationDetail")

@MainActor
final class ConversationDetailViewModel: ObservableObject {
    enum State {
        case loading
        case loaded
        case error(String)
    }

    @Published var state: State = .loading
    @Published var messages: [ConversationMessage] = []
    @Published var hasMore = false

    private let conversation: Conversation
    private let workspaceId: String
    private let accessToken: String
    private var lastValue: Int?

    init(conversation: Conversation, workspaceId: String, accessToken: String) {
        self.conversation = conversation
        self.workspaceId = workspaceId
        self.accessToken = accessToken
    }

    func loadMessages() async {
        state = .loading
        do {
            let response = try await ConversationService.fetchMessages(
                workspaceId: workspaceId,
                conversationId: conversation.sId,
                accessToken: accessToken
            )
            messages = response.messages.sorted(by: ConversationMessage.byRank)
            hasMore = response.hasMore
            lastValue = response.lastValue
            state = .loaded
        } catch {
            logger.error("Failed to load messages: \(error)")
            state = .error(error.localizedDescription)
        }
    }

    func loadMore() async {
        guard hasMore, let lastValue else { return }
        do {
            let response = try await ConversationService.fetchMessages(
                workspaceId: workspaceId,
                conversationId: conversation.sId,
                accessToken: accessToken,
                lastValue: lastValue
            )
            messages.append(contentsOf: response.messages)
            messages.sort(by: ConversationMessage.byRank)
            hasMore = response.hasMore
            self.lastValue = response.lastValue
        } catch {
            logger.error("Failed to load more messages: \(error)")
        }
    }
}
