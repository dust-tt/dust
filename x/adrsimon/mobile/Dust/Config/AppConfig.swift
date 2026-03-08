import Foundation

enum AppConfig {
    static let apiBaseURL = "https://dust.tt"
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
    }
}
