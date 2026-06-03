import SparkleTokens
import SwiftUI

enum Capability: Identifiable {
    case tool(MCPServerView)
    case skill(Skill)

    var id: String {
        switch self {
        case let .tool(serverView):
            "tool:\(serverView.sId)"
        case let .skill(skill):
            "skill:\(skill.sId)"
        }
    }

    var displayName: String {
        switch self {
        case let .tool(serverView):
            serverView.displayName
        case let .skill(skill):
            skill.name
        }
    }

    var displayDescription: String {
        switch self {
        case let .tool(serverView):
            serverView.displayDescription
        case let .skill(skill):
            skill.displayDescription
        }
    }

    var icon: SparkleIcon {
        switch self {
        case let .tool(serverView):
            MCPServerIcon.icon(for: serverView.server.name) ?? .bolt
        case .skill:
            .puzzle
        }
    }

    var isSkill: Bool {
        if case .skill = self { return true }
        return false
    }

    var sortKey: String {
        displayName.lowercased()
    }
}
