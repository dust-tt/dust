import Foundation
import os

private let logger = Logger(subsystem: AppConfig.bundleId, category: "Scribe")

/// Single-use ElevenLabs realtime token, minted by our backend so the device never
/// sees the workspace's ElevenLabs API key.
struct TranscribeToken: Decodable {
    let token: String
    let baseUri: String
}

enum TranscribeTokenService {
    static func fetch(workspaceId: String, tokenProvider: TokenProvider) async throws -> TranscribeToken {
        // Response keys are `token` / `baseUri` (no snake_case), so decode verbatim.
        try await APIClient.authenticatedGet(
            AppConfig.Endpoints.transcribeToken(workspaceId: workspaceId),
            tokenProvider: tokenProvider,
            snakeCase: false
        )
    }
}

/// Minimal client for ElevenLabs Scribe v2 realtime speech-to-text over a WebSocket.
/// Mirrors the wire protocol the `@elevenlabs/client` SDK speaks: audio is streamed as
/// base64 `input_audio_chunk` messages and the server replies with `partial_transcript`
/// (live, in-progress) and `committed_transcript` (finalized segment) messages. Commits
/// are automatic via server-side VAD; we send one manual commit on stop to flush the tail.
final class ScribeRealtimeClient {
    var onPartial: ((String) -> Void)?
    var onCommitted: ((String) -> Void)?
    var onError: ((String) -> Void)?

    private let token: String
    private let baseUri: String
    private let sampleRateHz = 16000

    private var task: URLSessionWebSocketTask?
    private var isClosed = false

    init(token: String, baseUri: String) {
        self.token = token
        self.baseUri = baseUri
    }

    func connect() throws {
        guard var components = URLComponents(string: "\(baseUri)/v1/speech-to-text/realtime") else {
            throw APIError.invalidURL
        }
        components.queryItems = [
            URLQueryItem(name: "model_id", value: "scribe_v2_realtime"),
            URLQueryItem(name: "token", value: token),
            URLQueryItem(name: "commit_strategy", value: "vad"),
            URLQueryItem(name: "audio_format", value: "pcm_16000"),
        ]
        guard let url = components.url else { throw APIError.invalidURL }

        let task = URLSession.shared.webSocketTask(with: url)
        self.task = task
        task.resume()
        receiveNext()
    }

    /// Queues a base64-encoded PCM chunk. `send` buffers until the socket finishes opening,
    /// so chunks captured during the handshake are delivered in order.
    func sendAudio(base64: String) {
        send([
            "message_type": "input_audio_chunk",
            "audio_base_64": base64,
            "commit": false,
            "sample_rate": sampleRateHz,
        ])
    }

    /// Flushes any buffered audio and asks the server to emit a final committed transcript.
    func commit() {
        send([
            "message_type": "input_audio_chunk",
            "audio_base_64": "",
            "commit": true,
            "sample_rate": sampleRateHz,
        ])
    }

    func close() {
        isClosed = true
        task?.cancel(with: .normalClosure, reason: nil)
        task = nil
    }

    private func send(_ object: [String: Any]) {
        guard let task, !isClosed,
              let data = try? JSONSerialization.data(withJSONObject: object),
              let json = String(data: data, encoding: .utf8)
        else { return }
        task.send(.string(json)) { error in
            if let error {
                logger.error("Scribe send failed: \(error)")
            }
        }
    }

    private func receiveNext() {
        task?.receive { [weak self] result in
            guard let self, !self.isClosed else { return }
            switch result {
            case let .success(message):
                if case let .string(text) = message {
                    handle(text)
                }
                receiveNext()
            case let .failure(error):
                onError?("Transcription connection lost: \(error.localizedDescription)")
            }
        }
    }

    private func handle(_ text: String) {
        guard let data = text.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = json["message_type"] as? String
        else { return }

        switch type {
        case "partial_transcript":
            if let value = json["text"] as? String { onPartial?(value) }
        case "committed_transcript", "committed_transcript_with_timestamps":
            if let value = json["text"] as? String { onCommitted?(value) }
        case "session_started":
            break
        default:
            // Every error variant (auth_error, quota_exceeded, …) carries an `error` field.
            if let errorMessage = json["error"] as? String {
                onError?(errorMessage)
            }
        }
    }
}
