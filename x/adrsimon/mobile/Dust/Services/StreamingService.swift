import Foundation
import os

private let logger = Logger(subsystem: AppConfig.bundleId, category: "Streaming")

/// URLSession delegate that preserves the Authorization header across redirects.
/// URLSession strips auth headers on redirect by default (security measure).
/// The Dust SSE endpoints redirect /api/…/events → /api/sse/…/events (307),
/// so we must re-attach the header.
private final class AuthPreservingDelegate: NSObject, URLSessionTaskDelegate {
    let accessToken: String

    init(accessToken: String) {
        self.accessToken = accessToken
    }

    func urlSession(
        _: URLSession,
        task _: URLSessionTask,
        willPerformHTTPRedirection _: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        var redirected = request
        redirected.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        completionHandler(redirected)
    }
}

/// Lightweight SSE client using URLSession async bytes.
enum StreamingService {
    /// Connects to a Server-Sent Events endpoint and yields parsed `data:` payloads.
    /// The stream ends when the server sends `data: done` or the task is cancelled.
    static func eventStream(
        endpoint: String,
        accessToken: String,
        lastEventId: String? = nil
    ) -> AsyncThrowingStream<String, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    let request = try buildRequest(
                        endpoint: endpoint,
                        accessToken: accessToken,
                        lastEventId: lastEventId
                    )

                    let delegate = AuthPreservingDelegate(accessToken: accessToken)
                    let session = URLSession(configuration: .default, delegate: delegate, delegateQueue: nil)

                    logger.info("SSE connecting: \(endpoint)")
                    let (bytes, response) = try await session.bytes(for: request)
                    defer { session.invalidateAndCancel() }

                    try validateResponse(response, endpoint: endpoint)

                    logger.info("SSE connected: \(endpoint)")
                    for try await line in bytes.lines {
                        guard !Task.isCancelled else { break }
                        guard line.hasPrefix("data: ") else { continue }

                        let payload = String(line.dropFirst(6))
                        if payload == "done" { break }

                        continuation.yield(payload)
                    }

                    continuation.finish()
                } catch {
                    if !Task.isCancelled {
                        logger.error("SSE stream error: \(error)")
                    }
                    continuation.finish(throwing: Task.isCancelled ? nil : error)
                }
            }

            continuation.onTermination = { _ in
                task.cancel()
            }
        }
    }

    private static func buildRequest(
        endpoint: String,
        accessToken: String,
        lastEventId: String?
    ) throws -> URLRequest {
        var urlString = "\(AppConfig.apiBaseURL)\(endpoint)"
        if let lastEventId, !lastEventId.isEmpty {
            let separator = urlString.contains("?") ? "&" : "?"
            urlString += "\(separator)lastEventId=\(lastEventId)"
        }

        guard let url = URL(string: urlString) else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        return request
    }

    private static func validateResponse(_ response: URLResponse, endpoint: String) throws {
        guard let httpResponse = response as? HTTPURLResponse,
              (200 ... 299).contains(httpResponse.statusCode)
        else {
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? -1
            logger.error("SSE connection failed: HTTP \(statusCode) for \(endpoint)")
            throw APIError.httpError(statusCode: statusCode, body: "SSE connection failed")
        }
    }
}
