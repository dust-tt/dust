import Foundation
import os

private let logger = Logger(subsystem: AppConfig.bundleId, category: "Transcription")

enum TranscriptionError: LocalizedError {
    case fileReadFailed
    case serverError(String)
    case noTranscript

    var errorDescription: String? {
        switch self {
        case .fileReadFailed:
            "Failed to read audio file"
        case let .serverError(message):
            message
        case .noTranscript:
            "No transcript received"
        }
    }
}

enum TranscriptionService {
    /// Uploads an audio file to the Dust transcription endpoint and returns the transcript.
    static func transcribe(
        fileURL: URL,
        workspaceId: String,
        tokenProvider: TokenProvider
    ) async throws -> String {
        let token = try await tokenProvider.validAccessToken()
        do {
            return try await performTranscription(fileURL: fileURL, workspaceId: workspaceId, accessToken: token)
        } catch let error as APIError where error.is401 {
            let freshToken = try await tokenProvider.refreshedAccessToken()
            return try await performTranscription(fileURL: fileURL, workspaceId: workspaceId, accessToken: freshToken)
        }
    }

    private static func performTranscription(
        fileURL: URL,
        workspaceId: String,
        accessToken: String
    ) async throws -> String {
        let endpoint = AppConfig.Endpoints.transcribe(workspaceId: workspaceId)
        guard let url = URL(string: "\(AppConfig.apiBaseURL)\(endpoint)") else {
            throw APIError.invalidURL
        }

        let fileData = try Data(contentsOf: fileURL)
        let boundary = UUID().uuidString

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = buildMultipartBody(
            fileData: fileData,
            fileName: fileURL.lastPathComponent,
            boundary: boundary
        )

        let (bytes, response) = try await URLSession.shared.bytes(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        if httpResponse.statusCode == 401 {
            throw APIError.httpError(statusCode: 401, body: "Unauthorized")
        }
        guard (200 ... 299).contains(httpResponse.statusCode) else {
            throw APIError.httpError(statusCode: httpResponse.statusCode, body: "Transcription request failed")
        }

        return try await parseSSEStream(bytes)
    }

    private static func buildMultipartBody(fileData: Data, fileName: String, boundary: String) -> Data {
        var body = Data()
        let crlf = "\r\n"
        body.append("--\(boundary)\(crlf)")
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(fileName)\"\(crlf)")
        body.append("Content-Type: audio/wav\(crlf)")
        body.append(crlf)
        body.append(fileData)
        body.append(crlf)
        body.append("--\(boundary)--\(crlf)")
        return body
    }

    private static func parseSSEStream(_ bytes: URLSession.AsyncBytes) async throws -> String {
        var transcript: String?

        for try await line in bytes.lines {
            guard line.hasPrefix("data: ") else { continue }
            let payload = String(line.dropFirst(6))
            if payload == "done" { break }
            transcript = try handleSSEPayload(payload, current: transcript)
        }

        guard let result = transcript, !result.isEmpty else {
            throw TranscriptionError.noTranscript
        }

        logger.info("Transcription complete: \(result.prefix(80))...")
        return result
    }

    private static func handleSSEPayload(_ payload: String, current: String?) throws -> String? {
        guard let data = payload.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = json["type"] as? String
        else { return current }

        switch type {
        case "fullTranscript":
            if let messages = json["fullTranscript"] as? [[String: Any]] {
                return reconstructText(from: messages)
            } else if let text = json["fullTranscript"] as? String {
                return text
            }
            return current
        case "error":
            throw TranscriptionError.serverError(json["error"] as? String ?? "Unknown transcription error")
        default:
            return current
        }
    }

    private static func reconstructText(from messages: [[String: Any]]) -> String {
        messages.map { msg in
            let type = msg["type"] as? String ?? ""
            switch type {
            case "mention":
                let name = msg["name"] as? String ?? ""
                return "@\(name)"
            case "text":
                return msg["text"] as? String ?? ""
            default:
                return ""
            }
        }.joined()
    }
}

// MARK: - Helpers

private extension Data {
    mutating func append(_ string: String) {
        if let data = string.data(using: .utf8) {
            append(data)
        }
    }
}

private extension APIError {
    var is401: Bool {
        if case let .httpError(statusCode, _) = self, statusCode == 401 {
            return true
        }
        return false
    }
}
