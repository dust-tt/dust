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
    let participantAvatarUrls: [String]
}

struct Conversation: Decodable, Identifiable, Hashable {
    let sId: String
    let created: Double
    let updated: Double
    var title: String?
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

        // Full listing returns version groups (array-of-arrays); the light/space listing is flat.
        let lastVersions: [PreviewMessage]? = if let versioned = try? container.decodeIfPresent(
            [[PreviewMessage]].self,
            forKey: .content
        ) {
            versioned.compactMap(\.last)
        } else {
            try container.decodeIfPresent([PreviewMessage].self, forKey: .content)
        }
        self.preview = lastVersions.flatMap(ConversationPreview.init(content:))
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

    var avatarUrl: String? {
        switch type {
        case MessageType.agentMessage.rawValue:
            configuration?.pictureUrl
        default:
            user?.image ?? context?.profilePictureUrl
        }
    }

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
        default:
            self.authorName = first.user?.fullName ?? first.context?.fullName
        }
        self.authorAvatarUrl = first.avatarUrl
        self.snippet = first.content?.strippedSnippet
        self.replyCount = max(0, valid.count - 1)
        self.participantAvatarUrls = valid.compactMap(\.avatarUrl).uniqued()
    }
}

private let citeDirectiveRegex = #/:cite\[[^\]]*\](?:\{[^}]*\})?/#
private let labeledDirectiveRegex = #/:{1,3}[a-z_]+\[(?<label>[^\]]*)\](?:\{[^}]*\})?/#
private let htmlTagRegex = #/<[^>]*>/#
private let markdownLinkRegex = #/!?\[(?<text>[^\]]*)\]\([^)]*\)/#
private let markdownEmphasisRegex = #/\*\*|__|~~|`/#

private extension String {
    static let leadingMarkdownMarkers = "#>-*` "

    /**
     * @cc [owner:adrsimon,label:product] snippet-is-plain-text
     * The snippet MUST NOT contain raw directives, tags, or markdown syntax: skill tags become the
     * skill name, mentions become `@Name`, pasted directives become `📎 title`, citations are
     * removed, other `:directive[label]{…}` become their label, links become their text.
     */
    var strippedSnippet: String {
        let plain = replacing(skillTagRegex) { skillTagName($0.output.attributes).map { "\($0) " } ?? "" }
            .replacing(mentionDirectiveRegex) { "@\($0.output.name)" }
            .replacing(pastedDirectiveRegex) { "📎 \($0.output.title) " }
            .replacing(citeDirectiveRegex, with: "")
            .replacing(labeledDirectiveRegex) { String($0.output.label) }
            .replacing(htmlTagRegex, with: "")
            .replacing(markdownLinkRegex) { String($0.output.text) }
            .replacing(markdownEmphasisRegex, with: "")
        let collapsed = plain.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        return String(collapsed.drop(while: { Self.leadingMarkdownMarkers.contains($0) }))
    }
}

private extension [String] {
    func uniqued() -> [String] {
        var seen = Set<String>()
        return filter { seen.insert($0).inserted }
    }
}

struct ConversationsResponse: Decodable {
    let conversations: [Conversation]
    let hasMore: Bool
    let lastValue: String?
}

// MARK: - Pod conversation listing

struct PodConversationListItem: Decodable {
    struct Avatar: Decodable {
        let name: String
        let visual: String
    }

    let id: String
    let title: String
    let created: Double
    let updated: Double
    let replyCount: Int
    let unreadMessageCount: Int
    let description: String
    let creator: Avatar?
    let avatars: [Avatar]
}

struct PodConversationsResponse: Decodable {
    let conversations: [PodConversationListItem]
    let hasMore: Bool
    let lastValue: String?
}

extension Conversation {
    init(podItem: PodConversationListItem) {
        self.sId = podItem.id
        self.created = podItem.created
        self.updated = podItem.updated
        self.title = podItem.title
        self.unread = podItem.unreadMessageCount > 0
        self.actionRequired = false
        self.preview = ConversationPreview(
            authorName: podItem.creator?.name,
            authorAvatarUrl: podItem.creator?.visual,
            snippet: podItem.description.strippedSnippet,
            replyCount: podItem.replyCount,
            participantAvatarUrls: ([podItem.creator].compactMap(\.self) + podItem.avatars)
                .map(\.visual)
                .filter { !$0.isEmpty }
                .uniqued()
        )
    }
}

extension Notification.Name {
    static let conversationTitleDidChange = Notification.Name("ConversationTitleDidChange")
    static let conversationDidMarkRead = Notification.Name("ConversationDidMarkRead")
}

enum ConversationTitleNotification {
    static let conversationIdKey = "conversationId"
    static let titleKey = "title"
}

enum ConversationReadNotification {
    static let conversationIdKey = "conversationId"
}

extension [Conversation] {
    mutating func updateTitle(conversationId: String, title: String) {
        guard let index = firstIndex(where: { $0.sId == conversationId }) else { return }
        self[index].title = title
    }
}

final class ConversationTitleObserver {
    private var observer: NSObjectProtocol?

    init(onTitleChange: @escaping @MainActor (_ conversationId: String, _ title: String) -> Void) {
        self.observer = NotificationCenter.default.addObserver(
            forName: .conversationTitleDidChange,
            object: nil,
            queue: .main
        ) { notification in
            guard let conversationId = notification
                .userInfo?[ConversationTitleNotification.conversationIdKey] as? String,
                let title = notification.userInfo?[ConversationTitleNotification.titleKey] as? String
            else { return }

            Task { @MainActor in
                onTitleChange(conversationId, title)
            }
        }
    }

    deinit {
        if let observer {
            NotificationCenter.default.removeObserver(observer)
        }
    }
}

final class ConversationReadObserver {
    private var observer: NSObjectProtocol?

    init(onMarkRead: @escaping @MainActor (_ conversationId: String) -> Void) {
        self.observer = NotificationCenter.default.addObserver(
            forName: .conversationDidMarkRead,
            object: nil,
            queue: .main
        ) { notification in
            guard let conversationId = notification
                .userInfo?[ConversationReadNotification.conversationIdKey] as? String
            else { return }

            Task { @MainActor in
                onMarkRead(conversationId)
            }
        }
    }

    deinit {
        if let observer {
            NotificationCenter.default.removeObserver(observer)
        }
    }
}
