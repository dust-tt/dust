import Foundation
import os
import WebKit

private let logger = Logger(subsystem: AppConfig.bundleId, category: "FrameHost")

/**
 * @cc [owner:adrsimon,label:product] frame-host-read-only
 * The bridge MUST only read: it answers `getFile` and `getUserIdentity` and logs
 * `setErrorMessage`, and MUST NOT write files or invoke frame functions. A `getFile` that cannot
 * be resolved or fetched MUST answer a missing file rather than an error, matching the web host.
 */
@MainActor
final class FrameHostBridge: NSObject, WKScriptMessageHandlerWithReply {
    static let handlerName = "frameHost"

    private let workspaceId: String
    private let file: FileReference
    private let isFrameV2: Bool
    private let tokenProvider: TokenProvider
    private let encoder = JSONEncoder()
    private var fileContext: Task<FrameFileContext, Never>?
    private var user: Task<DustUser?, Never>?

    init(workspaceId: String, file: FileReference, contentType: String, tokenProvider: TokenProvider) {
        self.workspaceId = workspaceId
        self.file = file
        self.isFrameV2 = Attachment.isFrameV2(contentType)
        self.tokenProvider = tokenProvider
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) async -> (Any?, String?) {
        guard let body = message.body as? String else { return (nil, "Invalid frame host message") }
        do {
            let request = try JSONDecoder().decode(FrameHostRequest.self, from: Data(body.utf8))
            return try await (handle(request), nil)
        } catch {
            logger.error("Frame host request failed: \(error)")
            return (nil, error.localizedDescription)
        }
    }

    private func handle(_ request: FrameHostRequest) async throws -> String? {
        switch request.command {
        case .getFile:
            return try await encode(loadFile(request.fileId))
        case .getUserIdentity:
            return try await encode(loadUserIdentity())
        case .setErrorMessage:
            logger.error("Frame reported an error: \(request.errorMessage ?? "unknown", privacy: .public)")
            return nil
        }
    }

    private func loadFile(_ frameFileId: String?) async -> FrameFilePayload {
        guard let frameFileId, let reference = await context().reference(for: frameFileId) else {
            return .missing
        }
        do {
            let rawFile = try await FrameService.fetchFile(
                workspaceId: workspaceId,
                file: reference,
                tokenProvider: tokenProvider
            )
            return FrameFilePayload(base64: rawFile.data.base64EncodedString(), contentType: rawFile.contentType)
        } catch {
            logger.error("Frame file fetch failed: \(error)")
            return .missing
        }
    }

    private func loadUserIdentity() async -> FrameUserIdentity {
        async let dustUser = currentUser()
        async let fileContext = context()
        guard let user = await dustUser else { return .anonymous }
        return await FrameUserIdentity(user: user, isFrameAuthor: fileContext.isFrameAuthor)
    }

    private func currentUser() async -> DustUser? {
        let task = user ?? Task { [tokenProvider] in
            do {
                return try await AuthService.fetchDustUser(tokenProvider: tokenProvider)
            } catch {
                logger.error("Frame user fetch failed: \(error)")
                return nil
            }
        }
        user = task
        return await task.value
    }

    private func context() async -> FrameFileContext {
        guard case let .id(frameFileId) = file else { return .empty }
        let task = fileContext ?? Task { [workspaceId, isFrameV2, tokenProvider] in
            await FrameService.fetchFileContext(
                workspaceId: workspaceId,
                frameFileId: frameFileId,
                isFrameV2: isFrameV2,
                tokenProvider: tokenProvider
            )
        }
        fileContext = task
        return await task.value
    }

    private func encode(_ value: some Encodable) throws -> String? {
        try String(bytes: encoder.encode(value), encoding: .utf8)
    }
}
