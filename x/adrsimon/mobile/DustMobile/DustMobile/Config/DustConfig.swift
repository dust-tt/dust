import Foundation

enum DustRegion: String, CaseIterable {
    case usCentral1 = "us-central1"
    case europeWest1 = "europe-west1"

    var domain: String {
        switch self {
        case .usCentral1: return "https://dust.tt"
        case .europeWest1: return "https://eu.dust.tt"
        }
    }
}

enum DustConfig {
    static let defaultDomain = "https://dust.tt"
    static let usURL = "https://dust.tt"
    static let euURL = "https://eu.dust.tt"

    static let oauthCallbackScheme = "dustmobile"
    static let oauthCallbackURL = "dustmobile://callback"

    static let workosClaimNamespace = "custom_"
    static let regionClaim = "\(workosClaimNamespace)region"
    static let connectionStrategyClaim = "\(workosClaimNamespace)connection.strategy"
    static let workspaceIdClaim = "\(workosClaimNamespace)workspaceId"

    static let defaultTokenExpirySeconds = 3600

    static let sseHeartbeatTimeout: TimeInterval = 90
    static let sseReconnectDelay: TimeInterval = 5
    static let sseMaxReconnectAttempts = 10

    static func domain(for region: String?) -> String {
        guard let region = region,
              let dustRegion = DustRegion(rawValue: region) else {
            return defaultDomain
        }
        return dustRegion.domain
    }
}
