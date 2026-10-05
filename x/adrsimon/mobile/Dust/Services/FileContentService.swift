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

    static func fetchFileData(
        workspaceId: String,
        file: FileReference,
        tokenProvider: TokenProvider
    ) async throws -> Data {
        switch file {
        case let .id(fileId):
            return try await fetchFileData(workspaceId: workspaceId, fileId: fileId, tokenProvider: tokenProvider)
        case let .path(path):
            let endpoint = AppConfig.Endpoints.filePathView(workspaceId: workspaceId, path: path)
            logger.info("Fetching file data by path")
            return try await APIClient.authenticatedGetRawData(endpoint, tokenProvider: tokenProvider)
        }
    }

    static func fetchPodFiles(
        workspaceId: String,
        spaceId: String,
        tokenProvider: TokenProvider
    ) async throws -> [PodFileEntry] {
        let endpoint = AppConfig.Endpoints.spaceFiles(workspaceId: workspaceId, spaceId: spaceId)
        let response: PodFilesResponse = try await APIClient.authenticatedGet(
            endpoint,
            tokenProvider: tokenProvider,
            snakeCase: false
        )
        return response.files
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
