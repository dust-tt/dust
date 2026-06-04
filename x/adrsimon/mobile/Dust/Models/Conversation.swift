import Foundation

extension Double {
    /// Converts a millisecond epoch timestamp to a Date.
    var dateFromEpochMs: Date {
        Date(timeIntervalSince1970: self / 1000)
    }
}

/// `nil` for endpoints that omit `content` (e.g. the inbox list).
struct ConversationPreview: Codable, Hashable {
    let authorName: String?
    let authorAvatarUrl: String?
    let snippet: String?
    let replyCount: Int
}

struct Conversation: Decodable, Identifiable, Hashable {
    let sId: String
    let created: Double
    let updated: Double
    let title: String?
    var unread: Bool
    var actionRequired: Bool
    let preview: ConversationPreview?

    var id: String {
        sId
    }

    var updatedDate: Date {
        updated.dateFromEpochMs
    }

    var createdDate: Date {
        created.dateFromEpochMs
    }

    var effectiveDate: Date {
        updated > 0 ? updatedDate : createdDate
    }

    private enum CodingKeys: String, CodingKey {
        case sId, created, updated, title, unread, actionRequired, content
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.sId = try container.decode(String.self, forKey: .sId)
        self.created = try container.decode(Double.self, forKey: .created)
        self.updated = try container.decode(Double.self, forKey: .updated)
        self.title = try container.decodeIfPresent(String.self, forKey: .title)
        self.unread = try container.decode(Bool.self, forKey: .unread)
        self.actionRequired = try container.decode(Bool.self, forKey: .actionRequired)

        let content = try container.decodeIfPresent([PreviewMessage].self, forKey: .content)
        self.preview = content.flatMap(ConversationPreview.init(content:))
    }
}

// MARK: - Preview derivation from the conversation `content` array

/// Fields beyond `type` are optional so this absorbs user, agent and compaction messages alike.
private struct PreviewMessage: Decodable {
    struct User: Decodable {
        let fullName: String?
        let image: String?
    }

    struct Context: Decodable {
        let fullName: String?
        let profilePictureUrl: String?
    }

    struct Configuration: Decodable {
        let name: String?
        let pictureUrl: String?
    }

    static let visibleUserVisibility = "visible"

    let type: String
    let content: String?
    let visibility: String?
    let status: String?
    let user: User?
    let context: Context?
    let configuration: Configuration?

    /// Mirrors the `validMessages` filter in the web front-end.
    var isValid: Bool {
        switch type {
        case MessageType.userMessage.rawValue:
            visibility == Self.visibleUserVisibility
        case MessageType.agentMessage.rawValue:
            status == AgentMessageStatus.succeeded.rawValue
        default:
            false
        }
    }
}

private extension ConversationPreview {
    init?(content: [PreviewMessage]) {
        let valid = content.filter(\.isValid)
        guard let first = valid.first else { return nil }

        switch first.type {
        case MessageType.agentMessage.rawValue:
            self.authorName = first.configuration?.name.map { "@\($0)" }
            self.authorAvatarUrl = first.configuration?.pictureUrl
        default:
            self.authorName = first.user?.fullName ?? first.context?.fullName
            self.authorAvatarUrl = first.user?.image ?? first.context?.profilePictureUrl
        }
        self.snippet = first.content?.strippedSnippet
        self.replyCount = max(0, valid.count - 1)
    }
}

private extension String {
    static let leadingMarkdownMarkers = "#>-*` "

    var strippedSnippet: String {
        let collapsed = split(whereSeparator: \.isWhitespace).joined(separator: " ")
        return String(collapsed.drop(while: { Self.leadingMarkdownMarkers.contains($0) }))
    }
}

struct ConversationsResponse: Decodable {
    let conversations: [Conversation]
    let hasMore: Bool
    let lastValue: String?
}
