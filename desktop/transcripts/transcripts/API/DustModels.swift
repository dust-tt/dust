import Foundation

// MARK: - API Response Models

struct DustSpace: Codable, Identifiable {
  let sId: String
  let name: String
  let description: String?

  var id: String { sId }
}

struct DustDataSource: Codable {
  let id: Int?
  let sId: String
  let createdAt: Int?
  let name: String
  let description: String?
  let dustAPIProjectId: String?
  let dustAPIDataSourceId: String?
  let connectorId: String?
  let connectorProvider: String?
  let assistantDefaultSelected: Bool?
}

struct DustDataSourceView: Codable, Identifiable {
  let sId: String
  let dataSource: DustDataSource
  let category: String?

  var id: String { sId }

  var name: String { dataSource.name }
  var connectorProvider: String? { dataSource.connectorProvider }

  var isFolder: Bool {
    return dataSource.connectorProvider == nil
  }
}

struct DustSpacesResponse: Codable {
  let spaces: [DustSpace]
}

struct DustDataSourceViewsResponse: Codable {
  let dataSourceViews: [DustDataSourceView]
}

struct DustTranscriptUploadResponse: Codable {
  let dataSource: DustDataSource
  let document: DustDocument

  enum CodingKeys: String, CodingKey {
    case dataSource = "data_source"
    case document
  }
}

struct DustDocument: Codable {
  let documentId: String

  enum CodingKeys: String, CodingKey {
    case documentId = "document_id"
  }
}

// MARK: - API Error Models

struct DustAPIError: Error, LocalizedError {
  let message: String
  let statusCode: Int?

  var errorDescription: String? {
    return message
  }

  static let invalidCredentials = DustAPIError(
    message: "Invalid credentials",
    statusCode: 401
  )
  static let networkError = DustAPIError(
    message: "Connection failed",
    statusCode: nil
  )
  static let decodingError = DustAPIError(
    message: "Invalid response",
    statusCode: nil
  )
}

// MARK: - Folder Selection Model

struct DustFolder: Identifiable, Hashable, Codable {
  let id: String
  let name: String
  let spaceName: String
  let spaceId: String
  let dataSourceId: String

  var displayName: String {
    return "\(spaceName) / \(name)"
  }
}
