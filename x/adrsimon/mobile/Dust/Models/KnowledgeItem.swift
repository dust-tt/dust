import SparkleTokens
import SwiftUI

struct KnowledgeItem: Identifiable {
    let title: String
    let internalId: String
    let dataSourceViewId: String
    let sourceUrl: String?
    let connectorProvider: String?
    let nodeType: String?

    var id: String { "\(dataSourceViewId):\(internalId)" }

    var icon: SparkleIcon {
        if let provider = connectorProvider, let icon = MCPServerIcon.icon(for: provider) {
            return icon
        }
        return nodeType == "table" ? .actionTable : .documentText
    }
}
