import Foundation
import os

private let logger = Logger(subsystem: AppConfig.bundleId, category: "FileContent")

enum FileContentService {
    static func fetchFileData(
        workspaceId: String,
        fileId: String,
        tokenProvider: TokenProvider
    ) async throws -> Data {
        let endpoint = AppConfig.Endpoints.fileView(workspaceId: workspaceId, fileId: fileId)
        logger.info("Fetching file data: \(fileId)")
        return try await APIClient.authenticatedGetRawData(endpoint, tokenProvider: tokenProvider)
    }

    static func fetchConversationAttachments(
        workspaceId: String,
        conversationId: String,
        tokenProvider: TokenProvider
    ) async throws -> [ConversationAttachment] {
        let endpoint = AppConfig.Endpoints.conversationAttachments(
            workspaceId: workspaceId,
            conversationId: conversationId
        )
        let response: ConversationAttachmentsResponse = try await APIClient.authenticatedGet(
            endpoint,
            tokenProvider: tokenProvider,
            snakeCase: false
        )
        return response.attachments
    }
}
