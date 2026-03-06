import Foundation

enum AppConfig {
    static let apiBaseURL = "https://dust.tt"
    static let callbackURLScheme = "dust"
    static let callbackURL = "\(callbackURLScheme)://auth"

    enum Endpoints {
        static let login = "/api/workos/login"
        static let authenticate = "/api/workos/authenticate"
        static let logout = "/api/workos/logout"
    }
}
