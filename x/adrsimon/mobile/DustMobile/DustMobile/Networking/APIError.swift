import Foundation

struct DustAPIErrorResponse: Codable {
    let error: DustAPIErrorDetail
}

struct DustAPIErrorDetail: Codable {
    let type: String
    let message: String
}

enum APIError: LocalizedError {
    case notAuthenticated
    case tokenExpired
    case networkError(Error)
    case httpError(statusCode: Int, detail: DustAPIErrorDetail?)
    case decodingError(Error)
    case invalidURL(String)
    case noData
    case sseError(String)

    var errorDescription: String? {
        switch self {
        case .notAuthenticated:
            return "Not authenticated. Please log in again."
        case .tokenExpired:
            return "Session expired. Please log in again."
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .httpError(let code, let detail):
            if let detail {
                return "Server error (\(code)): \(detail.message)"
            }
            return "Server error: \(code)"
        case .decodingError(let error):
            return "Failed to parse response: \(error.localizedDescription)"
        case .invalidURL(let url):
            return "Invalid URL: \(url)"
        case .noData:
            return "No data received."
        case .sseError(let message):
            return "Stream error: \(message)"
        }
    }
}
