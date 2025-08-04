import Foundation

// MARK: - API Response Models

struct DustSpace: Codable, Identifiable {
    let sId: String
    let name: String
    let description: String?
    
    var id: String { sId }
}

struct DustDataSourceView: Codable, Identifiable {
    let sId: String
    let name: String
    let description: String?
    let connectorProvider: String?
    
    var id: String { sId }
    
    // Only show data source views where connectorProvider is null
    var isManualDataSource: Bool {
        return connectorProvider == nil
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
        if let statusCode = statusCode {
            return "Dust API Error (\(statusCode)): \(message)"
        } else {
            return "Dust API Error: \(message)"
        }
    }
    
    static let invalidCredentials = DustAPIError(message: "Invalid API key or workspace ID", statusCode: 401)
    static let networkError = DustAPIError(message: "Network connection failed", statusCode: nil)
    static let decodingError = DustAPIError(message: "Failed to parse API response", statusCode: nil)
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