import Foundation

struct TranscriptUploadCredentials {
  let apiKey: String
  let workspaceId: String
  let spaceId: String
  let dataSourceId: String

  init?(from userDefaults: UserDefaultsManager.Type, selectedFolder: DustFolder)
  {
    guard let apiKey = userDefaults.shared.loadAPIKey(),
      let workspaceId = userDefaults.shared.loadWorkspaceId()
    else {
      return nil
    }

    self.apiKey = apiKey
    self.workspaceId = workspaceId
    self.spaceId = selectedFolder.spaceId
    self.dataSourceId = selectedFolder.dataSourceId
  }
}
