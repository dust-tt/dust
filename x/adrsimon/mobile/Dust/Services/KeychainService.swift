import Foundation
import os
import Security

private let logger = Logger(subsystem: AppConfig.bundleId, category: "Keychain")

enum KeychainService {
    private static let service = AppConfig.bundleId
    private static let accessibility = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly

    enum Key: String {
        case accessToken
        case refreshToken
        case tokenExpiry
    }

    /**
     * @cc [owner:adrsimon,label:security;product] tokens-readable-after-first-unlock
     * Saved items MUST stay readable while the device is locked once it has been unlocked since
     * boot, so background launches and prewarming can restore the session. Items MUST NOT sync off
     * the device. Saving MUST overwrite an existing item in place, never delete it first.
     */
    static func save(_ value: String, for key: Key) {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key.rawValue,
        ]
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: accessibility,
        ]

        let updateStatus = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if updateStatus == errSecSuccess {
            return
        }
        guard updateStatus == errSecItemNotFound else {
            logger.error("Keychain update failed for \(key.rawValue, privacy: .public): \(updateStatus)")
            return
        }

        let addQuery = query.merging(attributes) { _, new in new }
        let addStatus = SecItemAdd(addQuery as CFDictionary, nil)
        if addStatus != errSecSuccess {
            logger.error("Keychain save failed for \(key.rawValue, privacy: .public): \(addStatus)")
        }
    }

    static func load(_ key: Key) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key.rawValue,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess, let data = result as? Data else {
            if status != errSecItemNotFound {
                logger.error("Keychain load failed for \(key.rawValue, privacy: .public): \(status)")
            }
            return nil
        }

        return String(data: data, encoding: .utf8)
    }

    static func delete(_ key: Key) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key.rawValue,
        ]
        let status = SecItemDelete(query as CFDictionary)
        if status != errSecSuccess, status != errSecItemNotFound {
            logger.error("Keychain delete failed for \(key.rawValue, privacy: .public): \(status)")
        }
    }

    static func deleteAll() {
        delete(.accessToken)
        delete(.refreshToken)
        delete(.tokenExpiry)
    }
}
