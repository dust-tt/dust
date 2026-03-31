import Foundation

enum DeepLinkDestination {
    case auth(code: String)
    case frame(token: String)
}

enum DeepLinkRouter {
    static func resolve(_ url: URL) -> DeepLinkDestination? {
        if url.scheme == AppConfig.callbackURLScheme, url.host == "auth" {
            let code = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?.first(where: { $0.name == "code" })?.value
            if let code {
                return .auth(code: code)
            }
            return nil
        }

        if url.scheme == AppConfig.callbackURLScheme, url.host == "frame" {
            let token = url.pathComponents.dropFirst().first
            if let token, !token.isEmpty {
                return .frame(token: token)
            }
            return nil
        }

        if url.scheme == "https",
           let host = url.host,
           isDustDomain(host),
           url.pathComponents.count >= 4,
           url.pathComponents[1] == "share",
           url.pathComponents[2] == "frame"
        {
            return .frame(token: url.pathComponents[3])
        }

        return nil
    }

    static func isDustDomain(_ host: String) -> Bool {
        host == AppConfig.domain || host.hasSuffix(".\(AppConfig.domain)")
    }
}
