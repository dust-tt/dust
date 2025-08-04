import Foundation

class UserDefaultsManager {
    static let shared = UserDefaultsManager()
    private let apiKeyKey = "dust-api-key"
    
    private init() {}
    
    func saveAPIKey(_ apiKey: String) -> Bool {
        UserDefaults.standard.set(apiKey, forKey: apiKeyKey)
        return true
    }
    
    func loadAPIKey() -> String? {
        return UserDefaults.standard.string(forKey: apiKeyKey)
    }
    
    func deleteAPIKey() -> Bool {
        UserDefaults.standard.removeObject(forKey: apiKeyKey)
        return true
    }
    
    func hasAPIKey() -> Bool {
        return loadAPIKey() != nil && !loadAPIKey()!.isEmpty
    }
}