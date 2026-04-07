import Foundation

struct CreateConversationRequest: Encodable {
    let title: String? = nil
    let visibility: String = "unlisted"
    let spaceId: String? = nil
    let message: CreateMessagePayload
    let contentFragments: [String] = []

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        // Explicitly encode nil as JSON null (Swift omits nil by default)
        try container.encode(title, forKey: .title)
        try container.encode(visibility, forKey: .visibility)
        try container.encode(spaceId, forKey: .spaceId)
        try container.encode(message, forKey: .message)
        try container.encode(contentFragments, forKey: .contentFragments)
    }

    private enum CodingKeys: String, CodingKey {
        case title, visibility, spaceId, message, contentFragments
    }
}

struct CreateMessagePayload: Encodable {
    let content: String
    let mentions: [MentionPayload]
    let context: MessageContext
}

struct MentionPayload: Encodable {
    let configurationId: String
}

struct MessageContext: Encodable {
    let timezone: String
    let profilePictureUrl: String?

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(timezone, forKey: .timezone)
        // Explicitly encode nil as JSON null
        try container.encode(profilePictureUrl, forKey: .profilePictureUrl)
    }

    private enum CodingKeys: String, CodingKey {
        case timezone, profilePictureUrl
    }
}

struct CreateConversationResponse: Decodable {
    let conversation: Conversation
}

struct PostMessageRequest: Encodable {
    let content: String
    let mentions: [MentionPayload]
    let context: MessageContext
}

struct PostMessageResponse: Decodable {
    let message: UserMessage
}
