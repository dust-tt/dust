import Foundation

struct SearchNode: Decodable, Identifiable {
    let internalId: String
    let title: String
    let sourceUrl: String?
    let mimeType: String?
    let type: String?
    let parentTitle: String?
    let dataSource: SearchDataSource?
    let dataSourceViews: [SearchDataSourceView]?

    var id: String { internalId }

    func toKnowledgeItem() -> KnowledgeItem? {
        guard let dsvId = dataSourceViews?.first?.sId else { return nil }
        return KnowledgeItem(
            title: title,
            internalId: internalId,
            dataSourceViewId: dsvId,
            sourceUrl: sourceUrl,
            connectorProvider: dataSource?.connectorProvider,
            nodeType: type
        )
    }
}

struct SearchDataSource: Decodable {
    let name: String?
    let sId: String?
    let connectorProvider: String?
}

struct SearchDataSourceView: Decodable {
    let sId: String
    let spaceId: String?
}

struct SearchRequest: Encodable {
    let query: String
    let viewType = "all"
    let includeDataSources = false
    let limit = 25
}

struct SearchResponse: Decodable {
    let nodes: [SearchNode]
    let nextPageCursor: String?
    let resultsCount: Int?
}
