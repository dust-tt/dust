import Foundation

extension Double {
    /// Converts a millisecond epoch timestamp to a Date.
    var dateFromEpochMs: Date {
        Date(timeIntervalSince1970: self / 1000)
    }
}

struct Conversation: Codable, Identifiable {
    let id: Int
    let sId: String
    let created: Double
    let updated: Double
    let title: String?

    var updatedDate: Date {
        updated.dateFromEpochMs
    }

    var createdDate: Date {
        created.dateFromEpochMs
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
