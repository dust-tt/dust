import Foundation

struct Skill: Decodable, Identifiable {
    let sId: String
    let name: String
    let userFacingDescription: String?
    let icon: String?

    var id: String { sId }
    var displayDescription: String { userFacingDescription ?? "" }
}

struct SkillsResponse: Decodable {
    let skills: [Skill]
}
