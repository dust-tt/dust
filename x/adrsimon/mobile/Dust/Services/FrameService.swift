import Foundation
import os

private let logger = Logger(subsystem: AppConfig.bundleId, category: "Frame")

enum FrameService {
    static func fetchFileContext(
        workspaceId: String,
        frameFileId: String,
        isFrameV2: Bool,
        tokenProvider: TokenProvider
    ) async -> FrameFileContext {
        async let metadata = fetchUseCaseMetadata(
            workspaceId: workspaceId,
            fileId: frameFileId,
            tokenProvider: tokenProvider
        )
        async let permissions = isFrameV2
            ? fetchPermissions(workspaceId: workspaceId, frameId: frameFileId, tokenProvider: tokenProvider)
            : nil
        let (resolvedMetadata, resolvedPermissions) = await (metadata, permissions)
        return FrameFileContext(
            conversationId: resolvedMetadata?.conversationId,
            spaceId: resolvedMetadata?.spaceId,
            packageRoot: resolvedPermissions?.packageRoot,
            isFrameAuthor: resolvedPermissions?.isFrameAuthor ?? false
        )
    }

    static func fetchFile(
        workspaceId: String,
        file: FileReference,
        tokenProvider: TokenProvider
    ) async throws -> RawFile {
        let endpoint = switch file {
        case let .id(fileId):
            AppConfig.Endpoints.fileView(workspaceId: workspaceId, fileId: fileId)
        case let .path(path):
            AppConfig.Endpoints.filePathView(workspaceId: workspaceId, path: path)
        }
        return try await APIClient.authenticatedGetRawFile(endpoint, tokenProvider: tokenProvider)
    }

    private static func fetchUseCaseMetadata(
        workspaceId: String,
        fileId: String,
        tokenProvider: TokenProvider
    ) async -> FileUseCaseMetadataResponse.UseCaseMetadata? {
        do {
            let response: FileUseCaseMetadataResponse = try await APIClient.authenticatedGet(
                AppConfig.Endpoints.fileMetadata(workspaceId: workspaceId, fileId: fileId),
                tokenProvider: tokenProvider,
                snakeCase: false
            )
            return response.useCaseMetadata
        } catch {
            logger.error("Frame metadata fetch failed: \(error)")
            return nil
        }
    }

    private static func fetchPermissions(
        workspaceId: String,
        frameId: String,
        tokenProvider: TokenProvider
    ) async -> FramePermissions? {
        do {
            return try await APIClient.authenticatedGet(
                AppConfig.Endpoints.framePermissions(workspaceId: workspaceId, frameId: frameId),
                tokenProvider: tokenProvider,
                snakeCase: false
            )
        } catch {
            logger.error("Frame permissions fetch failed: \(error)")
            return nil
        }
    }
}
