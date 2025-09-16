import Foundation

class UserDefaultsManager {
  static let shared = UserDefaultsManager()
  private let apiKeyKey = "dust-api-key"
  private let workspaceIdKey = "dust-workspace-id"
  private let folderIdKey = "dust-folder-id"
  private let selectedFolderKey = "dust-selected-folder"

  private init() {}

  func saveCredentials(apiKey: String, workspaceId: String, folderId: String)
    -> Bool
  {
    UserDefaults.standard.set(apiKey, forKey: apiKeyKey)
    UserDefaults.standard.set(workspaceId, forKey: workspaceIdKey)
    UserDefaults.standard.set(folderId, forKey: folderIdKey)
    return true
  }

  func loadAPIKey() -> String? {
    return UserDefaults.standard.string(forKey: apiKeyKey)
  }

  func loadWorkspaceId() -> String? {
    return UserDefaults.standard.string(forKey: workspaceIdKey)
  }

  func loadFolderId() -> String? {
    return UserDefaults.standard.string(forKey: folderIdKey)
  }

  func deleteCredentials() -> Bool {
    UserDefaults.standard.removeObject(forKey: apiKeyKey)
    UserDefaults.standard.removeObject(forKey: workspaceIdKey)
    UserDefaults.standard.removeObject(forKey: folderIdKey)
    UserDefaults.standard.removeObject(forKey: selectedFolderKey)
    return true
  }

  func saveSelectedFolder(_ folder: DustFolder) -> Bool {
    do {
      let data = try JSONEncoder().encode(folder)
      UserDefaults.standard.set(data, forKey: selectedFolderKey)
      return true
    } catch {
      print("Failed to save selected folder: \(error)")
      return false
    }
  }

  func loadSelectedFolder() -> DustFolder? {
    guard let data = UserDefaults.standard.data(forKey: selectedFolderKey)
    else {
      return nil
    }

    do {
      return try JSONDecoder().decode(DustFolder.self, from: data)
    } catch {
      print("Failed to load selected folder: \(error)")
      return nil
    }
  }

  func hasCompleteCredentials() -> Bool {
    guard let apiKey = loadAPIKey(), !apiKey.isEmpty,
      let workspaceId = loadWorkspaceId(), !workspaceId.isEmpty
    else {
      return false
    }
    return true
  }

  func hasCompleteSetup() -> Bool {
    return hasCompleteCredentials() && loadSelectedFolder() != nil
  }
}
