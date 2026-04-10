import SparkleTokens
import SwiftUI

enum Capability: Identifiable {
    case tool(MCPServerView)
    case skill(Skill)

    var id: String {
        switch self {
        case let .tool(serverView):
            return "tool:\(serverView.sId)"
        case let .skill(skill):
            return "skill:\(skill.sId)"
        }
    }

    var displayName: String {
        switch self {
        case let .tool(serverView):
            return serverView.displayName
        case let .skill(skill):
            return skill.name
        }
    }

    var displayDescription: String {
        switch self {
        case let .tool(serverView):
            return serverView.displayDescription
        case let .skill(skill):
            return skill.displayDescription
        }
    }

    var icon: SparkleIcon {
        switch self {
        case let .tool(serverView):
            return MCPServerIcon.icon(for: serverView.server.name) ?? .bolt
        case .skill:
            return .puzzle
        }
    }

    var isSkill: Bool {
        if case .skill = self { return true }
        return false
    }

    var sortKey: String { displayName.lowercased() }
}
