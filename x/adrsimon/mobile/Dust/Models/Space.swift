import Foundation

struct Space: Codable, Identifiable, Hashable {
    let sId: String
    let name: String
    let kind: String
    let description: String?
    let isMember: Bool

    var id: String { sId }
}

struct SpaceSummaryEntry: Codable {
    let space: Space
}

struct SpaceSummaryResponse: Codable {
    let summary: [SpaceSummaryEntry]
}
