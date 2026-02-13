import Foundation

actor SSEClient {
    private let session: URLSession
    private var task: URLSessionDataTask?

    init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = DustConfig.sseHeartbeatTimeout
        self.session = URLSession(configuration: config)
    }

    /// Creates an AsyncThrowingStream that emits parsed SSE data strings.
    /// Each yielded value is the raw JSON string from a `data:` line.
    func stream(for request: URLRequest) -> AsyncThrowingStream<String, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    let (bytes, response) = try await session.bytes(for: request)

                    guard let httpResponse = response as? HTTPURLResponse,
                          (200...299).contains(httpResponse.statusCode) else {
                        let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                        continuation.finish(throwing: APIError.httpError(statusCode: statusCode, detail: nil))
                        return
                    }

                    var buffer = ""

                    for try await line in bytes.lines {
                        if Task.isCancelled {
                            continuation.finish()
                            return
                        }

                        if line.hasPrefix("data: ") {
                            let data = String(line.dropFirst(6))

                            if data == "done" {
                                continuation.yield("done")
                                // Don't finish - reconnect logic happens outside
                                continuation.finish()
                                return
                            }

                            continuation.yield(data)
                        }
                        // Ignore other SSE fields (event:, id:, retry:, comments)
                    }

                    // Stream ended normally
                    continuation.finish()
                } catch {
                    if !Task.isCancelled {
                        continuation.finish(throwing: error)
                    } else {
                        continuation.finish()
                    }
                }
            }

            continuation.onTermination = { _ in
                task.cancel()
            }
        }
    }

    func cancel() {
        task?.cancel()
        task = nil
    }
}

// MARK: - SSE Event Parser

enum SSEEventParser {
    static func parseConversationEvent(from jsonString: String) -> ConversationStreamEvent? {
        guard let data = jsonString.data(using: .utf8) else { return nil }

        // Try to determine the event type first
        struct EventTypeProbe: Codable {
            let type: String?
            let data: EventDataProbe?
        }
        struct EventDataProbe: Codable {
            let type: String?
        }

        // The conversation SSE wraps events in {eventId, data: {...}}
        // But sometimes it's just the raw event
        let decoder = JSONDecoder()

        // Try parsing as a wrapped event first
        if let wrapper = try? decoder.decode(ConversationEventWrapper.self, from: data) {
            return parseConversationEventData(wrapper.data)
        }

        // Try as raw event
        if let rawType = try? decoder.decode(EventTypeProbe.self, from: data),
           let type = rawType.type {
            return parseRawConversationEvent(type: type, data: data)
        }

        return .unknown(jsonString)
    }

    private static func parseConversationEventData(_ data: Data) -> ConversationStreamEvent? {
        let decoder = JSONDecoder()

        struct TypeProbe: Codable {
            let type: String
        }

        guard let probe = try? decoder.decode(TypeProbe.self, from: data),
              !probe.type.isEmpty else {
            return nil
        }

        switch probe.type {
        case "user_message_new":
            guard let event = try? decoder.decode(UserMessageNewEvent.self, from: data) else { return nil }
            return .userMessageNew(event)
        case "agent_message_new":
            guard let event = try? decoder.decode(AgentMessageNewEvent.self, from: data) else { return nil }
            return .agentMessageNew(event)
        case "agent_generation_cancelled":
            guard let event = try? decoder.decode(AgentGenerationCancelledEvent.self, from: data) else { return nil }
            return .agentGenerationCancelled(event)
        case "conversation_title":
            guard let event = try? decoder.decode(ConversationTitleEvent.self, from: data) else { return nil }
            return .conversationTitle(event)
        default:
            return nil
        }
    }

    private static func parseRawConversationEvent(type: String, data: Data) -> ConversationStreamEvent? {
        let decoder = JSONDecoder()
        switch type {
        case "user_message_new":
            guard let event = try? decoder.decode(UserMessageNewEvent.self, from: data) else { return nil }
            return .userMessageNew(event)
        case "agent_message_new":
            guard let event = try? decoder.decode(AgentMessageNewEvent.self, from: data) else { return nil }
            return .agentMessageNew(event)
        case "agent_generation_cancelled":
            guard let event = try? decoder.decode(AgentGenerationCancelledEvent.self, from: data) else { return nil }
            return .agentGenerationCancelled(event)
        case "conversation_title":
            guard let event = try? decoder.decode(ConversationTitleEvent.self, from: data) else { return nil }
            return .conversationTitle(event)
        default:
            return nil
        }
    }

    static func parseMessageEvent(from jsonString: String) -> AgentMessageStreamEvent? {
        guard let data = jsonString.data(using: .utf8) else { return nil }
        let decoder = JSONDecoder()

        // Try wrapped format first
        if let wrapper = try? decoder.decode(MessageEventWrapper.self, from: data) {
            return parseMessageEventData(wrapper.data)
        }

        // Try raw
        struct TypeProbe: Codable { let type: String }
        guard let probe = try? decoder.decode(TypeProbe.self, from: data) else { return nil }

        return parseRawMessageEvent(type: probe.type, data: data)
    }

    private static func parseMessageEventData(_ data: Data) -> AgentMessageStreamEvent? {
        let decoder = JSONDecoder()
        struct TypeProbe: Codable { let type: String }
        guard let probe = try? decoder.decode(TypeProbe.self, from: data) else { return nil }
        return parseRawMessageEvent(type: probe.type, data: data)
    }

    private static func parseRawMessageEvent(type: String, data: Data) -> AgentMessageStreamEvent? {
        let decoder = JSONDecoder()
        switch type {
        case "generation_tokens":
            guard let event = try? decoder.decode(GenerationTokensEvent.self, from: data) else { return nil }
            return .generationTokens(event)
        case "agent_action_success":
            guard let event = try? decoder.decode(AgentActionSuccessEvent.self, from: data) else { return nil }
            return .agentActionSuccess(event)
        case "agent_message_success":
            guard let event = try? decoder.decode(AgentMessageSuccessEvent.self, from: data) else { return nil }
            return .agentMessageSuccess(event)
        case "agent_error":
            guard let event = try? decoder.decode(AgentErrorEvent.self, from: data) else { return nil }
            return .agentError(event)
        case "agent_generation_cancelled":
            guard let event = try? decoder.decode(AgentGenerationCancelledEvent.self, from: data) else { return nil }
            return .agentGenerationCancelled(event)
        case "tool_params":
            guard let event = try? decoder.decode(ToolParamsEvent.self, from: data) else { return nil }
            return .toolParams(event)
        case "tool_notification":
            guard let event = try? decoder.decode(ToolNotificationEvent.self, from: data) else { return nil }
            return .toolNotification(event)
        case "tool_error":
            guard let event = try? decoder.decode(ToolErrorEvent.self, from: data) else { return nil }
            return .toolError(event)
        default:
            return .unknown(type)
        }
    }
}

// MARK: - Wrapper types for SSE envelope

private struct ConversationEventWrapper: Codable {
    let eventId: String?
    let data: Data

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        eventId = try container.decodeIfPresent(String.self, forKey: .eventId)
        // Re-encode the data field to pass to sub-parsers
        let rawData = try container.decode(RawJSON.self, forKey: .data)
        data = rawData.data
    }

    func encode(to encoder: Encoder) throws {
        // Not needed
    }

    enum CodingKeys: String, CodingKey {
        case eventId, data
    }
}

private struct MessageEventWrapper: Codable {
    let eventId: String?
    let data: Data

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        eventId = try container.decodeIfPresent(String.self, forKey: .eventId)
        let rawData = try container.decode(RawJSON.self, forKey: .data)
        data = rawData.data
    }

    func encode(to encoder: Encoder) throws {}

    enum CodingKeys: String, CodingKey {
        case eventId, data
    }
}

/// Helper to capture raw JSON for a field and re-encode it
private struct RawJSON: Codable {
    let data: Data

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        // Decode as a generic JSON value, then re-encode
        let jsonValue = try container.decode(AnyCodable.self)
        data = try JSONEncoder().encode(jsonValue)
    }

    func encode(to encoder: Encoder) throws {}
}

/// Type-erased Codable wrapper
private struct AnyCodable: Codable {
    let value: Any

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let dict = try? container.decode([String: AnyCodable].self) {
            value = dict.mapValues(\.value)
        } else if let array = try? container.decode([AnyCodable].self) {
            value = array.map(\.value)
        } else if let string = try? container.decode(String.self) {
            value = string
        } else if let int = try? container.decode(Int.self) {
            value = int
        } else if let double = try? container.decode(Double.self) {
            value = double
        } else if let bool = try? container.decode(Bool.self) {
            value = bool
        } else if container.decodeNil() {
            value = NSNull()
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported JSON type")
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch value {
        case let dict as [String: Any]:
            try container.encode(dict.mapValues { AnyCodable(value: $0) })
        case let array as [Any]:
            try container.encode(array.map { AnyCodable(value: $0) })
        case let string as String:
            try container.encode(string)
        case let int as Int:
            try container.encode(int)
        case let double as Double:
            try container.encode(double)
        case let bool as Bool:
            try container.encode(bool)
        case is NSNull:
            try container.encodeNil()
        default:
            try container.encodeNil()
        }
    }

    init(value: Any) {
        self.value = value
    }
}
