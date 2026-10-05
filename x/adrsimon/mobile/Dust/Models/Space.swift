import Foundation

struct Space: Codable, Identifiable, Hashable {
    let sId: String
    let name: String
    let kind: String
    let description: String?
    let isRestricted: Bool
    let isMember: Bool

    var id: String {
        sId
    }

    private enum CodingKeys: String, CodingKey {
        case sId, name, kind, description, isRestricted, isMember
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.sId = try container.decode(String.self, forKey: .sId)
        self.name = try container.decode(String.self, forKey: .name)
        self.kind = try container.decode(String.self, forKey: .kind)
        self.description = try container.decodeIfPresent(String.self, forKey: .description)
        self.isRestricted = try container.decodeIfPresent(Bool.self, forKey: .isRestricted) ?? false
        self.isMember = try container.decodeIfPresent(Bool.self, forKey: .isMember) ?? false
    }
}

struct SpaceSummaryEntry: Codable {
    let space: Space
}

struct SpaceSummaryResponse: Codable {
    let summary: [SpaceSummaryEntry]
}

struct SearchPodsResponse: Decodable {
    let spaces: [Space]
    let hasMore: Bool
    let lastValue: String?
}

struct SpacesResponse: Codable {
    let spaces: [Space]
}
