import Foundation

actor DustAPIClient {
    private let session: URLSession
    private let authService: AuthService

    init(authService: AuthService) {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 300
        self.session = URLSession(configuration: config)
        self.authService = authService
    }

    // MARK: - Generic request helpers

    private func authenticatedRequest(
        url: URL,
        method: String = "GET",
        body: Data? = nil,
        contentType: String = "application/json"
    ) async throws -> URLRequest {
        guard let token = await authService.getAccessToken() else {
            throw APIError.notAuthenticated
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("mobile", forHTTPHeaderField: "X-Request-Origin")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.httpBody = body
            request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        }
        return request
    }

    private func buildURL(domain: String, path: String, queryItems: [URLQueryItem]? = nil) throws -> URL {
        var components = URLComponents(string: domain + path)
        components?.queryItems = queryItems
        guard let url = components?.url else {
            throw APIError.invalidURL(domain + path)
        }
        return url
    }

    func request<T: Decodable>(
        domain: String,
        path: String,
        method: String = "GET",
        body: Encodable? = nil,
        queryItems: [URLQueryItem]? = nil
    ) async throws -> T {
        let url = try buildURL(domain: domain, path: path, queryItems: queryItems)
        var bodyData: Data?
        if let body {
            bodyData = try JSONEncoder().encode(body)
        }

        let request = try await authenticatedRequest(url: url, method: method, body: bodyData)
        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.networkError(URLError(.badServerResponse))
        }

        if httpResponse.statusCode == 401 {
            throw APIError.tokenExpired
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let errorDetail = try? JSONDecoder().decode(DustAPIErrorResponse.self, from: data)
            throw APIError.httpError(statusCode: httpResponse.statusCode, detail: errorDetail?.error)
        }

        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }

    // MARK: - Conversations

    func getConversations(domain: String, workspaceId: String) async throws -> [ConversationWithoutContent] {
        let response: ConversationsResponse = try await request(
            domain: domain,
            path: APIEndpoints.conversations(workspaceId: workspaceId)
        )
        return response.conversations
    }

    func getConversation(domain: String, workspaceId: String, conversationId: String) async throws -> ConversationPublicType {
        let response: ConversationResponse = try await request(
            domain: domain,
            path: APIEndpoints.conversation(workspaceId: workspaceId, conversationId: conversationId)
        )
        return response.conversation
    }

    func createConversation(
        domain: String,
        workspaceId: String,
        message: PostMessageBody,
        contentFragments: [PostContentFragmentBody],
        visibility: String = "unlisted"
    ) async throws -> ConversationPublicType {
        struct CreateBody: Encodable {
            let title: String? = nil
            let visibility: String
            let message: PostMessageBody
            let contentFragments: [PostContentFragmentBody]
            let blocking: Bool = false
        }

        let body = CreateBody(
            visibility: visibility,
            message: message,
            contentFragments: contentFragments
        )

        let response: CreateConversationResponse = try await request(
            domain: domain,
            path: APIEndpoints.conversations(workspaceId: workspaceId),
            method: "POST",
            body: body
        )
        return response.conversation
    }

    // MARK: - Messages

    func postMessage(
        domain: String,
        workspaceId: String,
        conversationId: String,
        message: PostMessageBody
    ) async throws -> UserMessageType {
        struct MessageResponse: Codable {
            let message: UserMessageType
        }

        let response: MessageResponse = try await request(
            domain: domain,
            path: APIEndpoints.messages(workspaceId: workspaceId, conversationId: conversationId),
            method: "POST",
            body: message
        )
        return response.message
    }

    func retryMessage(
        domain: String,
        workspaceId: String,
        conversationId: String,
        messageId: String
    ) async throws {
        let url = try buildURL(
            domain: domain,
            path: APIEndpoints.retryMessage(
                workspaceId: workspaceId,
                conversationId: conversationId,
                messageId: messageId
            )
        )
        let request = try await authenticatedRequest(url: url, method: "POST")
        let (_, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw APIError.httpError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0, detail: nil)
        }
    }

    // MARK: - Feedback

    func postFeedback(
        domain: String,
        workspaceId: String,
        conversationId: String,
        messageId: String,
        thumbDirection: String,
        content: String?
    ) async throws {
        struct FeedbackBody: Encodable {
            let thumbDirection: String
            let content: String?
        }

        let url = try buildURL(
            domain: domain,
            path: APIEndpoints.messageFeedback(
                workspaceId: workspaceId,
                conversationId: conversationId,
                messageId: messageId
            )
        )
        let body = try JSONEncoder().encode(FeedbackBody(thumbDirection: thumbDirection, content: content))
        let request = try await authenticatedRequest(url: url, method: "POST", body: body)
        let (_, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw APIError.httpError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0, detail: nil)
        }
    }

    // MARK: - Agents

    func getAgentConfigurations(domain: String, workspaceId: String, view: String = "list") async throws -> [LightAgentConfigurationType] {
        struct AgentsResponse: Codable {
            let agentConfigurations: [LightAgentConfigurationType]
        }

        let response: AgentsResponse = try await request(
            domain: domain,
            path: APIEndpoints.agentConfigurations(workspaceId: workspaceId),
            queryItems: [URLQueryItem(name: "view", value: view)]
        )
        return response.agentConfigurations
    }

    // MARK: - Content Fragments

    func postContentFragment(
        domain: String,
        workspaceId: String,
        conversationId: String,
        fragment: PostContentFragmentBody
    ) async throws -> ContentFragmentType {
        struct FragmentResponse: Codable {
            let contentFragment: ContentFragmentType
        }

        let response: FragmentResponse = try await request(
            domain: domain,
            path: APIEndpoints.contentFragments(workspaceId: workspaceId, conversationId: conversationId),
            method: "POST",
            body: fragment
        )
        return response.contentFragment
    }

    // MARK: - File Upload

    func uploadFile(
        domain: String,
        workspaceId: String,
        fileName: String,
        contentType: String,
        fileData: Data
    ) async throws -> FileUploadResponse {
        let url = try buildURL(domain: domain, path: APIEndpoints.files(workspaceId: workspaceId))

        guard let token = await authService.getAccessToken() else {
            throw APIError.notAuthenticated
        }

        let boundary = UUID().uuidString
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("mobile", forHTTPHeaderField: "X-Request-Origin")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()
        // Content type field
        body.appendMultipartField(name: "contentType", value: contentType, boundary: boundary)
        // File name field
        body.appendMultipartField(name: "fileName", value: fileName, boundary: boundary)
        // Use type "conversation"
        body.appendMultipartField(name: "useCase", value: "conversation", boundary: boundary)
        // File data
        body.appendMultipartFile(name: "file", fileName: fileName, contentType: contentType, data: fileData, boundary: boundary)
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        request.httpBody = body

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            let errorDetail = try? JSONDecoder().decode(DustAPIErrorResponse.self, from: data)
            throw APIError.httpError(
                statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0,
                detail: errorDetail?.error
            )
        }

        return try JSONDecoder().decode(FileUploadResponse.self, from: data)
    }

    // MARK: - Spaces

    func getSpaces(domain: String, workspaceId: String) async throws -> [SpaceType] {
        let response: SpacesResponse = try await request(
            domain: domain,
            path: APIEndpoints.spaces(workspaceId: workspaceId)
        )
        return response.spaces
    }

    func getDataSourceViews(domain: String, workspaceId: String, spaceId: String) async throws -> [DataSourceViewType] {
        let response: DataSourceViewsResponse = try await request(
            domain: domain,
            path: APIEndpoints.dataSourceViews(workspaceId: workspaceId, spaceId: spaceId)
        )
        return response.dataSourceViews
    }

    func getContentNodes(
        domain: String,
        workspaceId: String,
        spaceId: String,
        dataSourceViewId: String,
        parentId: String?
    ) async throws -> [DataSourceViewContentNodeType] {
        var queryItems: [URLQueryItem] = []
        if let parentId {
            queryItems.append(URLQueryItem(name: "parentId", value: parentId))
        }

        let response: ContentNodesResponse = try await request(
            domain: domain,
            path: APIEndpoints.contentNodes(workspaceId: workspaceId, spaceId: spaceId, dataSourceViewId: dataSourceViewId),
            queryItems: queryItems.isEmpty ? nil : queryItems
        )
        return response.nodes
    }

    // MARK: - SSE Stream URL builder

    func buildSSERequest(domain: String, path: String, lastEventId: String? = nil) async throws -> URLRequest {
        var queryItems: [URLQueryItem] = []
        if let lastEventId {
            queryItems.append(URLQueryItem(name: "lastEventId", value: lastEventId))
        }

        let url = try buildURL(domain: domain, path: path, queryItems: queryItems.isEmpty ? nil : queryItems)

        guard let token = await authService.getAccessToken() else {
            throw APIError.notAuthenticated
        }

        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.setValue("mobile", forHTTPHeaderField: "X-Request-Origin")
        request.timeoutInterval = DustConfig.sseHeartbeatTimeout
        return request
    }
}

// MARK: - Request/Response bodies

struct PostMessageBody: Encodable {
    let content: String
    let context: PostMessageContext
    let mentions: [AgentMentionType]
}

struct PostMessageContext: Encodable {
    let username: String
    let email: String?
    let fullName: String?
    let timezone: String
    let profilePictureUrl: String?
    let origin: String
}

struct PostContentFragmentBody: Encodable {
    let title: String
    let fileId: String?
    let url: String?
    let nodeId: String?
    let nodeDataSourceViewId: String?
    let context: PostContentFragmentContext
}

struct PostContentFragmentContext: Encodable {
    let username: String
    let email: String?
    let fullName: String?
    let profilePictureUrl: String?
}

struct FileUploadResponse: Codable {
    let file: UploadedFile
}

struct UploadedFile: Codable {
    let fileId: String
    let title: String?
}

// MARK: - Data helpers

extension Data {
    mutating func appendMultipartField(name: String, value: String, boundary: String) {
        append("--\(boundary)\r\n".data(using: .utf8)!)
        append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n".data(using: .utf8)!)
        append("\(value)\r\n".data(using: .utf8)!)
    }

    mutating func appendMultipartFile(name: String, fileName: String, contentType: String, data: Data, boundary: String) {
        append("--\(boundary)\r\n".data(using: .utf8)!)
        append("Content-Disposition: form-data; name=\"\(name)\"; filename=\"\(fileName)\"\r\n".data(using: .utf8)!)
        append("Content-Type: \(contentType)\r\n\r\n".data(using: .utf8)!)
        append(data)
        append("\r\n".data(using: .utf8)!)
    }
}
