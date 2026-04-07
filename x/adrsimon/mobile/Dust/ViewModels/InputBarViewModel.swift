import AVFoundation
import Foundation
import os
import SwiftUI

private let logger = Logger(subsystem: AppConfig.bundleId, category: "InputBar")

@MainActor
final class InputBarViewModel: ObservableObject {
    @Published var agents: [LightAgentConfiguration] = []
    @Published var messageText: String = ""
    @Published var isSending = false
    @Published var error: String?
    @Published var showAgentPicker = false
    @Published var attachments: [Attachment] = []
    @Published var showPhotoPicker = false
    @Published var showDocumentPicker = false

    lazy var speechService = SpeechService(workspaceId: workspaceId, tokenProvider: tokenProvider)

    private let workspaceId: String
    private let tokenProvider: TokenProvider
    private let user: User

    /// Continuations waiting for all uploads to finish.
    private var uploadWaiters: [CheckedContinuation<Void, Never>] = []
    /// Active upload tasks, keyed by attachment ID for cancellation.
    private var uploadTasks: [UUID: Task<Void, Never>] = [:]

    init(workspaceId: String, tokenProvider: TokenProvider, user: User) {
        self.workspaceId = workspaceId
        self.tokenProvider = tokenProvider
        self.user = user
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
        } catch {
            logger.error("Failed to load agents: \(error)")
        }
    }

    func handleTextChange(_ text: String) {
        if text.hasSuffix("@") {
            let beforeAt = text.dropLast()
            if beforeAt.isEmpty || beforeAt.last == " " {
                showAgentPicker = true
            }
        }
    }

    func insertMention(_ agent: LightAgentConfiguration) {
        var base = messageText
        if base.hasSuffix("@") {
            base = String(base.dropLast())
        }
        let trimmed = base.trimmingCharacters(in: .whitespaces)
        messageText = trimmed.isEmpty ? "@\(agent.name) " : "\(trimmed) @\(agent.name) "
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
            message: CreateMessagePayload(
                content: text,
                mentions: resolveMentionsWithDefault(in: text),
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
            mentions: resolveMentionsWithDefault(in: text),
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
        MessageContext(
            timezone: TimeZone.current.identifier,
            profilePictureUrl: user.profilePictureUrl
        )
    }

    private func prepareSend() -> (text: String, context: MessageContext) {
        let text = messageText.trimmingCharacters(in: .whitespacesAndNewlines)
        return (text, messageContext)
    }

    private func resolveMentionsWithDefault(in text: String) -> [MentionPayload] {
        let mentions = resolveMentions(in: text)
        return mentions.isEmpty ? [MentionPayload(configurationId: "dust")] : mentions
    }

    private func resolveMentions(in text: String) -> [MentionPayload] {
        var result: [MentionPayload] = []
        var seen = Set<String>()

        for agent in agents {
            if text.contains("@\(agent.name)"), !seen.contains(agent.sId) {
                result.append(MentionPayload(configurationId: agent.sId))
                seen.insert(agent.sId)
            }
        }
        return result
    }

    private func performSend<T>(_ operation: () async throws -> T) async -> T? {
        isSending = true
        error = nil

        do {
            let result = try await operation()
            isSending = false
            messageText = ""
            attachments = []
            return result
        } catch {
            logger.error("Send failed: \(error)")
            self.error = error.localizedDescription
            isSending = false
            return nil
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
        attachments.compactMap { attachment in
            guard let fileId = attachment.fileId else { return nil }
            return ContentFragmentPayload(
                title: attachment.fileName,
                fileId: fileId,
                context: ContentFragmentContext(profilePictureUrl: user.profilePictureUrl)
            )
        }
    }
}
