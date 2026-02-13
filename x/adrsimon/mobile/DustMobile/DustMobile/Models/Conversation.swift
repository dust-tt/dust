import Foundation

struct ConversationWithoutContent: Codable, Identifiable, Equatable {
    let id: Int
    let created: Int
    let updated: Int?
    let unread: Bool
    let actionRequired: Bool
    let sId: String
    let title: String?
    let visibility: String
    let owner: WorkspaceType
}

struct ConversationPublicType: Codable, Identifiable, Equatable {
    let id: Int
    let created: Int
    let updated: Int?
    let unread: Bool
    let actionRequired: Bool
    let sId: String
    var title: String?
    let visibility: String
    let owner: WorkspaceType
    var content: [[MessageUnion]]
    let url: String
}

struct ConversationsResponse: Codable {
    let conversations: [ConversationWithoutContent]
}

struct ConversationResponse: Codable {
    let conversation: ConversationPublicType
}

struct CreateConversationResponse: Codable {
    let conversation: ConversationPublicType
}
