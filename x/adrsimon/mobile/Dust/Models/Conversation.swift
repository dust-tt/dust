import Foundation

struct Conversation: Codable, Identifiable {
    let id: Int
    let sId: String
    let created: Double
    let updated: Double
    let title: String?

    var updatedDate: Date {
        Date(timeIntervalSince1970: updated / 1000)
    }

    var createdDate: Date {
        Date(timeIntervalSince1970: created / 1000)
    }

    var effectiveDate: Date {
        updated > 0 ? updatedDate : createdDate
    }
}

struct ConversationsResponse: Codable {
    let conversations: [Conversation]
    let hasMore: Bool
    let lastValue: String?
}
