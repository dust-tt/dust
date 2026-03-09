import Foundation
import os

private let logger = Logger(subsystem: AppConfig.bundleId, category: "APIClient")

enum APIError: LocalizedError {
    case invalidURL
    case invalidResponse
    case httpError(statusCode: Int, body: String)
    case decodingError(Error)
    case networkError(Error)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            "Invalid URL"
        case .invalidResponse:
            "Invalid response from server"
        case let .httpError(statusCode, body):
            "HTTP \(statusCode): \(body)"
        case let .decodingError(error):
            "Failed to decode response: \(error.localizedDescription)"
        case let .networkError(error):
            error.localizedDescription
        }
    }
}

enum APIClient {
    private static let snakeCaseDecoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()

    private static let camelCaseDecoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()

    private static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        return encoder
    }()

    private static let camelCaseEncoder: JSONEncoder = .init()

    // MARK: - Public (raw access token)

    static func get<T: Decodable>(
        _ endpoint: String,
        accessToken: String? = nil,
        snakeCase: Bool = true
    ) async throws -> T {
        var request = try buildRequest(endpoint: endpoint, accessToken: accessToken)
        request.httpMethod = "GET"
        let decoder = snakeCase ? snakeCaseDecoder : camelCaseDecoder
        return try await execute(request, endpoint: endpoint, decoder: decoder)
    }

    static func post<T: Decodable>(
        _ endpoint: String,
        body: some Encodable,
        accessToken: String? = nil
    ) async throws -> T {
        var request = try buildRequest(endpoint: endpoint, accessToken: accessToken)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(body)
        return try await execute(request, endpoint: endpoint, decoder: snakeCaseDecoder)
    }

    static func postNoResponse(
        _ endpoint: String,
        body: some Encodable,
        accessToken: String? = nil
    ) async throws {
        var request = try buildRequest(endpoint: endpoint, accessToken: accessToken)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(body)
        _ = try await performRequest(request)
    }

    // MARK: - Public (TokenProvider with automatic 401 retry)

    static func authenticatedGet<T: Decodable>(
        _ endpoint: String,
        tokenProvider: TokenProvider,
        snakeCase: Bool = true
    ) async throws -> T {
        let decoder = snakeCase ? snakeCaseDecoder : camelCaseDecoder
        return try await withAuthRetry(tokenProvider: tokenProvider) { token in
            var request = try buildRequest(endpoint: endpoint, accessToken: token)
            request.httpMethod = "GET"
            return try await execute(request, endpoint: endpoint, decoder: decoder)
        }
    }

    static func authenticatedPost<T: Decodable>(
        _ endpoint: String,
        body: some Encodable,
        tokenProvider: TokenProvider,
        snakeCase: Bool = true
    ) async throws -> T {
        let selectedEncoder = snakeCase ? encoder : camelCaseEncoder
        let selectedDecoder = snakeCase ? snakeCaseDecoder : camelCaseDecoder
        let encodedBody = try selectedEncoder.encode(body)
        return try await withAuthRetry(tokenProvider: tokenProvider) { token in
            var request = try buildRequest(endpoint: endpoint, accessToken: token)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = encodedBody
            return try await execute(request, endpoint: endpoint, decoder: selectedDecoder)
        }
    }

    /// Executes a closure with a valid access token, retrying once on 401 after refreshing.
    private static func withAuthRetry<T>(
        tokenProvider: TokenProvider,
        _ operation: (String) async throws -> T
    ) async throws -> T {
        let token = try await tokenProvider.validAccessToken()
        do {
            return try await operation(token)
        } catch APIError.httpError(statusCode: 401, _) {
            let freshToken = try await tokenProvider.refreshedAccessToken()
            return try await operation(freshToken)
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

    /// Executes the request and validates the HTTP response, returning the raw data.
    private static func performRequest(_ request: URLRequest) async throws -> Data {
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

        guard (200 ... 299).contains(httpResponse.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? "Unknown error"
            throw APIError.httpError(statusCode: httpResponse.statusCode, body: body)
        }

        return data
    }

    private static func execute<T: Decodable>(
        _ request: URLRequest,
        endpoint: String,
        decoder: JSONDecoder
    ) async throws -> T {
        let data = try await performRequest(request)

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
