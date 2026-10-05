import Foundation

enum AppConfig {
    static let domain = "dust.tt"

    // The DEV flag is set by the `Dev` build configuration (see project.yml); it
    // points the app at a local front server. `Prod` and `Release` builds hit prod.
    #if DEV
    static let apiBaseURL = "http://localhost:3000"
    static let appURL = "http://localhost:3000"
    #else
    static let apiBaseURL = "https://\(domain)"
    static let appURL = "https://app.\(domain)"
    #endif

    static let vizURL = "https://viz.\(domain)"
    static let bundleId = "com.dust.mobile"
    static let callbackURLScheme = "dust"
    static let callbackURL = "\(callbackURLScheme)://auth"

    enum Endpoints {
        static let login = "/api/workos/login"
        static let authenticate = "/api/workos/authenticate"
        static let logout = "/api/workos/logout"
        static let user = "/api/user"

        static func conversations(workspaceId: String) -> String {
            "/api/w/\(workspaceId)/assistant/conversations"
        }

        static func conversation(workspaceId: String, conversationId: String) -> String {
            "/api/w/\(workspaceId)/assistant/conversations/\(conversationId)"
        }

        static func conversationMessages(workspaceId: String, conversationId: String) -> String {
            "/api/w/\(workspaceId)/assistant/conversations/\(conversationId)/messages"
        }

        static func conversationMessage(workspaceId: String, conversationId: String, messageId: String) -> String {
            "/api/w/\(workspaceId)/assistant/conversations/\(conversationId)/messages/\(messageId)"
        }

        static func conversationEvents(workspaceId: String, conversationId: String) -> String {
            "/api/w/\(workspaceId)/assistant/conversations/\(conversationId)/events"
        }

        static func messageEvents(workspaceId: String, conversationId: String, messageId: String) -> String {
            "/api/w/\(workspaceId)/assistant/conversations/\(conversationId)/messages/\(messageId)/events"
        }

        static func conversationsBulkActions(workspaceId: String) -> String {
            "/api/w/\(workspaceId)/assistant/conversations/bulk-actions"
        }

        static func agentConfigurations(workspaceId: String) -> String {
            "/api/v1/w/\(workspaceId)/assistant/agent_configurations"
        }

        static func transcribeToken(workspaceId: String) -> String {
            "/api/w/\(workspaceId)/services/transcribe/get-token"
        }

        static func files(workspaceId: String) -> String {
            "/api/w/\(workspaceId)/files"
        }

        static func conversationContentFragments(workspaceId: String, conversationId: String) -> String {
            "/api/w/\(workspaceId)/assistant/conversations/\(conversationId)/content_fragment"
        }

        static func fileView(workspaceId: String, fileId: String) -> String {
            "/api/w/\(workspaceId)/files/\(fileId)?action=view"
        }

        static func filePathView(workspaceId: String, path: String) -> String {
            let encodedPath = path.split(separator: "/")
                .map { $0.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? String($0) }
                .joined(separator: "/")
            return "/api/w/\(workspaceId)/files/path/\(encodedPath)"
        }

        static func fileMetadata(workspaceId: String, fileId: String) -> String {
            "/api/w/\(workspaceId)/files/\(fileId)/metadata"
        }

        static func framePermissions(workspaceId: String, frameId: String) -> String {
            "/api/w/\(workspaceId)/frames/\(frameId)/permissions"
        }

        static func spaceFiles(workspaceId: String, spaceId: String) -> String {
            "/api/w/\(workspaceId)/spaces/\(spaceId)/files"
        }

        static func conversationAttachments(workspaceId: String, conversationId: String) -> String {
            "/api/w/\(workspaceId)/assistant/conversations/\(conversationId)/attachments"
        }

        static func blockedActions(workspaceId: String, conversationId: String) -> String {
            "/api/w/\(workspaceId)/assistant/conversations/\(conversationId)/actions/blocked"
        }

        static func validateAction(workspaceId: String, conversationId: String, messageId: String) -> String {
            "/api/v1/w/\(workspaceId)/assistant/conversations/\(conversationId)/messages/\(messageId)/validate-action"
        }

        static func retryMessage(workspaceId: String, conversationId: String, messageId: String) -> String {
            "/api/v1/w/\(workspaceId)/assistant/conversations/\(conversationId)/messages/\(messageId)/retry"
        }

        static func answerQuestion(workspaceId: String, conversationId: String, messageId: String) -> String {
            "/api/v1/w/\(workspaceId)/assistant/conversations/\(conversationId)/messages/\(messageId)/answer-question"
        }

        static func mcpServerViews(workspaceId: String) -> String {
            "/api/w/\(workspaceId)/mcp/views"
        }

        static func skills(workspaceId: String) -> String {
            "/api/w/\(workspaceId)/skills"
        }

        static func conversationTools(workspaceId: String, conversationId: String) -> String {
            "/api/w/\(workspaceId)/assistant/conversations/\(conversationId)/tools"
        }

        static func search(workspaceId: String) -> String {
            "/api/w/\(workspaceId)/search"
        }

        static func spaces(workspaceId: String) -> String {
            "/api/w/\(workspaceId)/spaces"
        }

        static func searchPods(workspaceId: String, query: String, lastValue: String?, limit: Int) -> String {
            var components = URLComponents()
            components.path = "/api/w/\(workspaceId)/spaces/search_projects"
            components.percentEncodedQueryItems = [
                ("limit", String(limit)),
                ("query", query),
                ("lastValue", lastValue),
            ].compactMap { name, value in
                value.map { URLQueryItem(
                    name: name,
                    value: $0.addingPercentEncoding(withAllowedCharacters: .queryValueAllowed)
                ) }
            }
            return components.string ?? components.path
        }

        static func joinPod(workspaceId: String, spaceId: String) -> String {
            "/api/w/\(workspaceId)/spaces/\(spaceId)/join"
        }

        static func spacesSummary(workspaceId: String) -> String {
            "/api/w/\(workspaceId)/assistant/conversations/spaces"
        }

        static func spaceConversations(workspaceId: String, spaceId: String) -> String {
            "/api/w/\(workspaceId)/assistant/conversations/spaces/\(spaceId)"
        }

        static func searchConversations(workspaceId: String) -> String {
            "/api/w/\(workspaceId)/assistant/conversations/search"
        }

        static func searchSpaceConversations(workspaceId: String, spaceId: String) -> String {
            "/api/w/\(workspaceId)/spaces/\(spaceId)/search_conversations"
        }
    }
}

private extension CharacterSet {
    static let queryValueAllowed = CharacterSet.urlQueryAllowed.subtracting(CharacterSet(charactersIn: "&+=?#"))
}
