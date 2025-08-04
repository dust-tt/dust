import Foundation

// MARK: - API Response Models

struct DustSpace: Codable, Identifiable {
  let sId: String
  let name: String
  let description: String?

  var id: String { sId }
}

struct DustDataSource: Codable {
  let sId: String
  let name: String
  let description: String?
  let connectorProvider: String?
}

struct DustDataSourceView: Codable, Identifiable {
  let sId: String
  let dataSource: DustDataSource
  let category: String?

  var id: String { sId }

  // Use the dataSource name and connectorProvider
  var name: String { dataSource.name }
  var connectorProvider: String? { dataSource.connectorProvider }

  // Only show data source views where connectorProvider is null
  var isManualDataSource: Bool {
    return dataSource.connectorProvider == nil
  }
}

struct DustSpacesResponse: Codable {
  let spaces: [DustSpace]
}

struct DustDataSourceViewsResponse: Codable {
  let dataSourceViews: [DustDataSourceView]
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
  let dataSourceViewId: String

  var displayName: String {
    return "\(spaceName) / \(name)"
  }
}
