import Foundation
import os

private let logger = Logger(subsystem: AppConfig.bundleId, category: "FileUpload")

enum FileUploadService {
    /// Step 1: Create file record and get the upload URL.
    static func createFileRecord(
        workspaceId: String,
        fileName: String,
        contentType: String,
        fileSize: Int,
        tokenProvider: TokenProvider
    ) async throws -> UploadedFile {
        let endpoint = AppConfig.Endpoints.files(workspaceId: workspaceId)
        let request = FileUploadRequest(
            contentType: contentType,
            fileName: fileName,
            fileSize: fileSize
        )
        let response: FileUploadResponse = try await APIClient.authenticatedPost(
            endpoint,
            body: request,
            tokenProvider: tokenProvider,
            snakeCase: false
        )
        return response.file
    }

    /// Step 2: Upload the actual file content to the upload URL.
    static func uploadFileContent(
        uploadUrl: String,
        fileData: Data,
        fileName: String,
        contentType: String,
        tokenProvider: TokenProvider
    ) async throws -> UploadedFileResult {
        let response: FileUploadedResponse = try await APIClient.authenticatedMultipartUpload(
            uploadUrl,
            fileData: fileData,
            fileName: fileName,
            mimeType: contentType,
            tokenProvider: tokenProvider,
            snakeCase: false
        )
        return response.file
    }

    /// Combined: create record + upload content. Returns the file sId.
    static func uploadFile(
        workspaceId: String,
        fileName: String,
        contentType: String,
        fileData: Data,
        tokenProvider: TokenProvider
    ) async throws -> String {
        logger.info("Uploading file: \(fileName) (\(contentType), \(fileData.count) bytes)")

        let record = try await createFileRecord(
            workspaceId: workspaceId,
            fileName: fileName,
            contentType: contentType,
            fileSize: fileData.count,
            tokenProvider: tokenProvider
        )

        _ = try await uploadFileContent(
            uploadUrl: record.uploadUrl,
            fileData: fileData,
            fileName: fileName,
            contentType: contentType,
            tokenProvider: tokenProvider
        )

        logger.info("Upload complete: fileId=\(record.sId)")
        return record.sId
    }

    // swiftlint:disable:next function_parameter_count
    static func postContentFragment(
        workspaceId: String,
        conversationId: String,
        fileId: String,
        fileName: String,
        profilePictureUrl: String?,
        tokenProvider: TokenProvider
    ) async throws {
        let endpoint = AppConfig.Endpoints.conversationContentFragments(
            workspaceId: workspaceId,
            conversationId: conversationId
        )
        let request = PostContentFragmentRequest(
            title: fileName,
            fileId: fileId,
            context: ContentFragmentContext(profilePictureUrl: profilePictureUrl)
        )
        let _: PostContentFragmentResponse = try await APIClient.authenticatedPost(
            endpoint,
            body: request,
            tokenProvider: tokenProvider,
            snakeCase: false
        )
    }
}
