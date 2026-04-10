import AVFoundation
import Foundation
import os
import SwiftUI

private let logger = Logger(subsystem: AppConfig.bundleId, category: "InputBar")

@MainActor
final class InputBarViewModel: ObservableObject {
    @Published var agents: [LightAgentConfiguration] = []
    @Published var selectedAgent: LightAgentConfiguration?
    @Published var messageText: String = ""
    @Published var isSending = false
    @Published var error: String?
    @Published var showAgentPicker = false
    @Published var attachments: [Attachment] = []
    @Published var showPhotoPicker = false
    @Published var showDocumentPicker = false
    @Published var showCapabilitiesPicker = false
    @Published var showKnowledgePicker = false
    @Published var availableCapabilities: [Capability] = []
    @Published var selectedCapabilities: [Capability] = []
    @Published var selectedKnowledgeItems: [KnowledgeItem] = []
    private var hasLoadedCapabilities = false

    lazy var speechService = SpeechService(workspaceId: workspaceId, tokenProvider: tokenProvider)

    let workspaceId: String
    let tokenProvider: TokenProvider
    private let user: User
    private let spaceId: String?

    /// Continuations waiting for all uploads to finish.
    private var uploadWaiters: [CheckedContinuation<Void, Never>] = []
    /// Active upload tasks, keyed by attachment ID for cancellation.
    private var uploadTasks: [UUID: Task<Void, Never>] = [:]

    init(workspaceId: String, tokenProvider: TokenProvider, user: User, spaceId: String? = nil) {
        self.workspaceId = workspaceId
        self.tokenProvider = tokenProvider
        self.user = user
        self.spaceId = spaceId
    }

    func loadAgents() async {
        do {
            let fetched = try await AgentService.fetchAgents(
                workspaceId: workspaceId,
                tokenProvider: tokenProvider
            )
            agents = fetched.sorted { lhs, rhs in
                if lhs.userFavorite != rhs.userFavorite {
                    return lhs.userFavorite
                }
                return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
            }
            if selectedAgent == nil {
                selectedAgent = agents.first { $0.sId == "dust" } ?? agents.first
            }
        } catch {
            logger.error("Failed to load agents: \(error)")
        }
    }

    func loadCapabilities() async {
        guard !hasLoadedCapabilities else { return }
        hasLoadedCapabilities = true
        do {
            // Skills don't need spaceIds, so fetch them alongside spaces
            async let skillsFetch = CapabilityService.fetchSkills(
                workspaceId: workspaceId,
                tokenProvider: tokenProvider
            )
            async let spacesFetch = SpaceService.fetchGlobalSpaces(
                workspaceId: workspaceId,
                tokenProvider: tokenProvider
            )

            let (skills, globalSpaces) = try await (skillsFetch, spacesFetch)

            let tools = try await CapabilityService.fetchMCPServerViews(
                workspaceId: workspaceId,
                spaceIds: globalSpaces.map(\.sId),
                tokenProvider: tokenProvider
            )

            let merged: [Capability] = tools.map { .tool($0) } + skills.map { .skill($0) }
            availableCapabilities = merged.sorted { $0.sortKey < $1.sortKey }
        } catch {
            logger.error("Failed to load capabilities: \(error)")
        }
    }

    func selectCapability(_ capability: Capability, conversationId: String? = nil) {
        guard !selectedCapabilities.contains(where: { $0.id == capability.id }) else { return }
        selectedCapabilities.append(capability)
        showCapabilitiesPicker = false

        if let conversationId {
            Task {
                do { try await syncCapability(capability, action: .add, conversationId: conversationId) }
                catch { logger.error("Failed to sync capability: \(error)") }
            }
        }
    }

    func deselectCapability(_ capability: Capability, conversationId: String? = nil) {
        selectedCapabilities.removeAll { $0.id == capability.id }

        if let conversationId {
            Task {
                do { try await syncCapability(capability, action: .delete, conversationId: conversationId) }
                catch { logger.error("Failed to sync capability: \(error)") }
            }
        }
    }

    func selectKnowledgeItem(_ item: KnowledgeItem) {
        guard !selectedKnowledgeItems.contains(where: { $0.id == item.id }) else { return }
        selectedKnowledgeItems.append(item)
        showKnowledgePicker = false
    }

    func deselectKnowledgeItem(_ item: KnowledgeItem) {
        selectedKnowledgeItems.removeAll { $0.id == item.id }
    }

    func handleTextChange(_ text: String) {
        if text.hasSuffix("@") {
            let beforeAt = text.dropLast()
            if beforeAt.isEmpty || beforeAt.last == " " {
                showAgentPicker = true
            }
        }
    }

    func selectAgent(_ agent: LightAgentConfiguration) {
        selectedAgent = agent
        // Remove trailing @ if the picker was triggered by typing it
        if messageText.hasSuffix("@") {
            messageText = String(messageText.dropLast())
        }
        showAgentPicker = false
    }

    // MARK: - Attachments

    func cancelUploads() {
        for task in uploadTasks.values {
            task.cancel()
        }
        uploadTasks.removeAll()
    }

    func addAttachment(data: Data, fileName: String, contentType: String, thumbnail: UIImage?) {
        let attachment = Attachment(
            fileName: fileName,
            contentType: contentType,
            fileSize: data.count,
            data: data,
            thumbnailImage: thumbnail
        )
        attachments.append(attachment)

        uploadTasks[attachment.id] = Task { [weak self] in
            await self?.uploadAttachment(id: attachment.id)
            self?.uploadTasks[attachment.id] = nil
        }
    }

    func removeAttachment(_ attachment: Attachment) {
        uploadTasks[attachment.id]?.cancel()
        uploadTasks[attachment.id] = nil
        attachments.removeAll { $0.id == attachment.id }
        notifyWaitersIfDone()
    }

    func addPhotoResults(_ results: [PhotoPickerResult]) {
        for result in results {
            addAttachment(
                data: result.data,
                fileName: result.fileName,
                contentType: result.contentType,
                thumbnail: result.thumbnail
            )
        }
    }

    func addDocumentResults(_ results: [DocumentPickerResult]) {
        for result in results {
            addAttachment(
                data: result.data,
                fileName: result.fileName,
                contentType: result.contentType,
                thumbnail: nil
            )
        }
    }

    // MARK: - Sending

    var canSend: Bool {
        let hasText = !messageText
            .trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let hasAttachments = !attachments.isEmpty
        let hasFailedUploads = attachments.contains {
            if case .failed = $0.uploadState { true } else { false }
        }
        return (hasText || hasAttachments)
            && !isSending && !hasFailedUploads
    }

    func sendMessage() async -> Conversation? {
        guard canSend else { return nil }
        let (text, context) = prepareSend()

        await waitForUploads()

        let fragmentPayloads = buildContentFragmentPayloads()

        let request = CreateConversationRequest(
            spaceId: spaceId,
            message: CreateMessagePayload(
                content: text,
                mentions: resolveMentions(),
                context: context
            ),
            contentFragments: fragmentPayloads
        )

        return await performSend {
            try await ConversationService.createConversation(
                workspaceId: self.workspaceId,
                request: request,
                tokenProvider: self.tokenProvider
            )
        }
    }

    func sendReply(conversationId: String) async -> Bool {
        guard canSend else { return false }
        let (text, context) = prepareSend()

        await waitForUploads()

        let request = PostMessageRequest(
            content: text,
            mentions: resolveMentions(),
            context: context
        )

        let sent: Void? = await performSend {
            try await withThrowingTaskGroup(of: Void.self) { group in
                for attachment in self.attachments {
                    if let fileId = attachment.fileId {
                        let fileName = attachment.fileName
                        group.addTask {
                            try await FileUploadService.postContentFragment(
                                workspaceId: self.workspaceId,
                                conversationId: conversationId,
                                fileId: fileId,
                                fileName: fileName,
                                profilePictureUrl: self.user.profilePictureUrl,
                                tokenProvider: self.tokenProvider
                            )
                        }
                    }
                }
                try await group.waitForAll()
            }

            try await ConversationService.postMessage(
                workspaceId: self.workspaceId,
                conversationId: conversationId,
                request: request,
                tokenProvider: self.tokenProvider
            )
        }
        return sent != nil
    }

    // MARK: - Voice Input

    func startVoiceInput() {
        guard !speechService.isRecording, !speechService.isTranscribing else { return }

        switch AVAudioApplication.shared.recordPermission {
        case .granted:
            speechService.startRecording()
        case .undetermined:
            Task {
                let granted = await speechService.ensureMicPermission()
                if granted { speechService.startRecording() }
            }
        default:
            speechService.error = "Microphone permission denied"
        }
    }

    func stopVoiceInput() {
        speechService.stopRecording()
        Task {
            await speechService.transcribe()
            if let transcriptionError = speechService.error {
                error = transcriptionError
            } else {
                messageText = speechService.transcribedText
            }
            speechService.transcribedText = ""
        }
    }

    func cancelVoiceInput() {
        speechService.stopRecording()
        speechService.cleanupRecording()
        speechService.transcribedText = ""
    }

    // MARK: - Private

    private var messageContext: MessageContext {
        var toolIds: [String] = []
        var skillIds: [String] = []
        for capability in selectedCapabilities {
            switch capability {
            case let .tool(serverView): toolIds.append(serverView.sId)
            case let .skill(skill): skillIds.append(skill.sId)
            }
        }
        return MessageContext(
            timezone: TimeZone.current.identifier,
            profilePictureUrl: user.profilePictureUrl,
            selectedMCPServerViewIds: toolIds.isEmpty ? nil : toolIds,
            selectedSkillIds: skillIds.isEmpty ? nil : skillIds
        )
    }

    private func prepareSend() -> (text: String, context: MessageContext) {
        let text = messageText.trimmingCharacters(in: .whitespacesAndNewlines)
        return (text, messageContext)
    }

    private func resolveMentions() -> [MentionPayload] {
        let agentId = selectedAgent?.sId ?? "dust"
        return [MentionPayload(configurationId: agentId)]
    }

    private func performSend<T>(_ operation: () async throws -> T) async -> T? {
        isSending = true
        error = nil

        do {
            let result = try await operation()
            isSending = false
            messageText = ""
            selectedAgent = nil
            attachments = []
            selectedCapabilities = []
            selectedKnowledgeItems = []
            return result
        } catch {
            logger.error("Send failed: \(error)")
            self.error = error.localizedDescription
            isSending = false
            return nil
        }
    }

    // MARK: - Capabilities

    private func syncCapability(_ capability: Capability, action: ConversationAction, conversationId: String) async throws {
        switch capability {
        case let .tool(serverView):
            try await CapabilityService.updateTool(
                action: action,
                workspaceId: workspaceId,
                conversationId: conversationId,
                mcpServerViewId: serverView.sId,
                tokenProvider: tokenProvider
            )
        case let .skill(skill):
            try await CapabilityService.updateSkill(
                action: action,
                workspaceId: workspaceId,
                conversationId: conversationId,
                skillId: skill.sId,
                tokenProvider: tokenProvider
            )
        }
    }

    // MARK: - Upload

    private func uploadAttachment(id: UUID) async {
        guard let index = attachments.firstIndex(where: { $0.id == id }) else { return }

        // Capture values before any async work
        let fileName = attachments[index].fileName
        let contentType = attachments[index].contentType
        guard let fileData = attachments[index].data else { return }

        attachments[index].uploadState = .uploading

        do {
            let fileId = try await FileUploadService.uploadFile(
                workspaceId: workspaceId,
                fileName: fileName,
                contentType: contentType,
                fileData: fileData,
                tokenProvider: tokenProvider
            )
            if let idx = attachments.firstIndex(where: { $0.id == id }) {
                attachments[idx].uploadState = .uploaded(fileId: fileId)
                attachments[idx].data = nil
            }
        } catch {
            logger.error("Upload failed for \(id): \(error)")
            if let idx = attachments.firstIndex(where: { $0.id == id }) {
                attachments[idx].uploadState = .failed(error: error.localizedDescription)
            }
        }

        notifyWaitersIfDone()
    }

    /// Suspends until all attachments have finished uploading (or failed).
    /// If all are already done, returns immediately.
    private func waitForUploads() async {
        await withCheckedContinuation { continuation in
            if attachments.contains(where: { !$0.isFinished }) {
                uploadWaiters.append(continuation)
            } else {
                continuation.resume()
            }
        }
    }

    private func notifyWaitersIfDone() {
        guard !attachments.contains(where: { !$0.isFinished }) else { return }

        let waiters = uploadWaiters
        uploadWaiters = []
        for waiter in waiters {
            waiter.resume()
        }
    }

    private func buildContentFragmentPayloads() -> [ContentFragmentPayload] {
        let ctx = ContentFragmentContext(profilePictureUrl: user.profilePictureUrl)

        let fileFragments: [ContentFragmentPayload] = attachments.compactMap { attachment in
            guard let fileId = attachment.fileId else { return nil }
            return .file(title: attachment.fileName, fileId: fileId, context: ctx)
        }

        let knowledgeFragments: [ContentFragmentPayload] = selectedKnowledgeItems.map { item in
            .node(title: item.title, nodeId: item.internalId, nodeDataSourceViewId: item.dataSourceViewId, context: ctx)
        }

        return fileFragments + knowledgeFragments
    }
}
