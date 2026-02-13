import Foundation
import CryptoKit

enum PKCEHelper {
    struct PKCEPair {
        let codeVerifier: String
        let codeChallenge: String
    }

    /// Generate a PKCE code verifier and challenge pair.
    /// Port of extension/shared/lib/utils.ts:11-38
    static func generate() -> PKCEPair {
        let codeVerifier = generateCodeVerifier()
        let codeChallenge = generateCodeChallenge(from: codeVerifier)
        return PKCEPair(codeVerifier: codeVerifier, codeChallenge: codeChallenge)
    }

    private static func generateCodeVerifier() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return base64URLEncode(Data(bytes))
    }

    private static func generateCodeChallenge(from verifier: String) -> String {
        let data = Data(verifier.utf8)
        let hash = SHA256.hash(data: data)
        return base64URLEncode(Data(hash))
    }

    private static func base64URLEncode(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
