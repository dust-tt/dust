import Foundation
import os

private let logger = Logger(subsystem: "com.dust.mobile", category: "APIClient")

enum APIError: LocalizedError {
    case invalidURL
    case invalidResponse
    case httpError(statusCode: Int, body: String)
    case decodingError(Error)
    case networkError(Error)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid URL"
        case .invalidResponse:
            return "Invalid response from server"
        case .httpError(let statusCode, let body):
            return "HTTP \(statusCode): \(body)"
        case .decodingError(let error):
            return "Failed to decode response: \(error.localizedDescription)"
        case .networkError(let error):
            return error.localizedDescription
        }
    }
}

enum APIClient {
    private static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()

    private static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        return encoder
    }()

    // MARK: - Public

    static func get<T: Decodable>(
        _ endpoint: String,
        accessToken: String? = nil
    ) async throws -> T {
        var request = try buildRequest(endpoint: endpoint, accessToken: accessToken)
        request.httpMethod = "GET"
        return try await execute(request, endpoint: endpoint)
    }

    static func post<T: Decodable, B: Encodable>(
        _ endpoint: String,
        body: B,
        accessToken: String? = nil
    ) async throws -> T {
        var request = try buildRequest(endpoint: endpoint, accessToken: accessToken)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(body)
        return try await execute(request, endpoint: endpoint)
    }

    static func postNoResponse<B: Encodable>(
        _ endpoint: String,
        body: B,
        accessToken: String? = nil
    ) async throws {
        var request = try buildRequest(endpoint: endpoint, accessToken: accessToken)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(body)

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw APIError.networkError(error)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? "Unknown error"
            throw APIError.httpError(statusCode: httpResponse.statusCode, body: body)
        }
    }

    private static func buildRequest(endpoint: String, accessToken: String?) throws -> URLRequest {
        guard let url = URL(string: "\(AppConfig.apiBaseURL)\(endpoint)") else {
            throw APIError.invalidURL
        }
        var request = URLRequest(url: url)
        if let accessToken {
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    private static func execute<T: Decodable>(_ request: URLRequest, endpoint: String) async throws -> T {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw APIError.networkError(error)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? "Unknown error"
            throw APIError.httpError(statusCode: httpResponse.statusCode, body: body)
        }

        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            let rawBody = String(data: data, encoding: .utf8) ?? "<non-utf8>"
            logger.error("Decoding failed for \(endpoint). Raw response:\n\(rawBody)")
            logger.error("Decode error: \(error)")
            throw APIError.decodingError(error)
        }
    }
}
