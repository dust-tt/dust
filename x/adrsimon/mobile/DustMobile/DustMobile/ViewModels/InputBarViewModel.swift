import Foundation
import PhotosUI

@MainActor
@Observable
class InputBarViewModel {
    var text = ""
    var mentions: [AgentMentionType] = []
    var mentionNames: [String: String] = [:] // configurationId -> name
    var attachments: ContentFragments = ContentFragments()
    var isUploadingFile = false
    var showAgentPicker = false
    var showAttachmentPicker = false

    @ObservationIgnored private let appState: AppState

    init(appState: AppState) {
        self.appState = appState
    }

    var canSend: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !mentions.isEmpty
    }

    // MARK: - Mention handling

    /// Detect @ trigger in text
    var isTypingMention: Bool {
        guard let lastWord = text.components(separatedBy: .whitespaces).last else { return false }
        return lastWord.hasPrefix("@") && lastWord.count >= 1
    }

    var mentionQuery: String {
        guard let lastWord = text.components(separatedBy: .whitespaces).last,
              lastWord.hasPrefix("@") else { return "" }
        return String(lastWord.dropFirst())
    }

    func addMention(agent: LightAgentConfigurationType) {
        // Replace @query with @agentName
        if let range = text.range(of: "@\(mentionQuery)", options: .backwards) {
            text.replaceSubrange(range, with: "@\(agent.name) ")
        } else {
            text += "@\(agent.name) "
        }

        let mention = AgentMentionType(configurationId: agent.sId)
        if !mentions.contains(where: { $0.configurationId == agent.sId }) {
            mentions.append(mention)
            mentionNames[agent.sId] = agent.name
        }
        showAgentPicker = false
    }

    func removeMention(configurationId: String) {
        mentions.removeAll { $0.configurationId == configurationId }
        if let name = mentionNames.removeValue(forKey: configurationId) {
            text = text.replacingOccurrences(of: "@\(name)", with: "")
        }
    }

    // MARK: - File upload

    func uploadFile(data: Data, fileName: String, contentType: String) async {
        guard let workspaceId = appState.workspaceId else { return }

        isUploadingFile = true

        do {
            let response = try await appState.apiClient.uploadFile(
                domain: appState.domain,
                workspaceId: workspaceId,
                fileName: fileName,
                contentType: contentType,
                fileData: data
            )

            attachments.uploaded.append(UploadedContentFragment(
                fileId: response.file.fileId,
                title: response.file.title ?? fileName,
                url: nil
            ))
        } catch {
            print("File upload failed: \(error)")
        }

        isUploadingFile = false
    }

    func removeAttachment(at index: Int) {
        if index < attachments.uploaded.count {
            attachments.uploaded.remove(at: index)
        }
    }

    func addContentNode(_ node: ContentNodeAttachment) {
        attachments.contentNodes.append(node)
    }

    func removeContentNode(at index: Int) {
        if index < attachments.contentNodes.count {
            attachments.contentNodes.remove(at: index)
        }
    }

    // MARK: - Reset

    func reset() {
        text = ""
        mentions = []
        mentionNames = [:]
        attachments = ContentFragments()
    }

    /// Build the final message content (replace @names with proper syntax)
    func buildMessageContent() -> String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
