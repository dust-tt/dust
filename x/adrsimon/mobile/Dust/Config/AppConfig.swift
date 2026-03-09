import Foundation

enum AppConfig {
    static let apiBaseURL = "https://dust.tt"
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

        static func conversationMessages(workspaceId: String, conversationId: String) -> String {
            "/api/w/\(workspaceId)/assistant/conversations/\(conversationId)/messages"
        }

        static func conversationEvents(workspaceId: String, conversationId: String) -> String {
            "/api/w/\(workspaceId)/assistant/conversations/\(conversationId)/events"
        }

        static func messageEvents(workspaceId: String, conversationId: String, messageId: String) -> String {
            "/api/w/\(workspaceId)/assistant/conversations/\(conversationId)/messages/\(messageId)/events"
        }

        static func agentConfigurations(workspaceId: String) -> String {
            "/api/v1/w/\(workspaceId)/assistant/agent_configurations"
        }
    }
}
