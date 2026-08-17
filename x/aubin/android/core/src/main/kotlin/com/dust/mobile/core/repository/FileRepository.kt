package com.dust.mobile.core.repository

import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.config.Endpoints
import com.dust.mobile.core.model.ContentFragmentContext
import com.dust.mobile.core.model.ContentFragmentPayload
import com.dust.mobile.core.model.ConversationAttachmentsResponse
import com.dust.mobile.core.model.FileUploadResponse
import com.dust.mobile.core.model.FileUploadedResponse
import com.dust.mobile.core.model.PostContentFragmentResponse
import com.dust.mobile.core.network.ApiClient
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

class FileRepository(
    private val apiClient: ApiClient,
) {
    suspend fun uploadFile(
        workspaceId: String,
        fileName: String,
        contentType: String,
        fileData: ByteArray,
        tokenProvider: TokenProvider,
    ): String {
        val record = apiClient.authenticatedPost<ConversationFileUploadRequest, FileUploadResponse>(
            Endpoints.files(workspaceId),
            ConversationFileUploadRequest(
                contentType = contentType,
                fileName = fileName,
                fileSize = fileData.size,
            ),
            tokenProvider,
        ).file

        apiClient.authenticatedMultipartUpload<FileUploadedResponse>(
            urlString = record.uploadUrl,
            fileData = fileData,
            fileName = fileName,
            mimeType = contentType,
            tokenProvider = tokenProvider,
        )

        return record.sId
    }

    suspend fun postContentFragment(
        workspaceId: String,
        conversationId: String,
        fileId: String,
        fileName: String,
        profilePictureUrl: String?,
        tokenProvider: TokenProvider,
    ) {
        postContentFragment(
            workspaceId = workspaceId,
            conversationId = conversationId,
            payload = ContentFragmentPayload.file(
                title = fileName,
                fileId = fileId,
                context = ContentFragmentContext(profilePictureUrl = profilePictureUrl),
            ),
            tokenProvider = tokenProvider,
        )
    }

    suspend fun postContentFragment(
        workspaceId: String,
        conversationId: String,
        payload: ContentFragmentPayload,
        tokenProvider: TokenProvider,
    ) {
        apiClient.authenticatedPost<ContentFragmentPayload, PostContentFragmentResponse>(
            Endpoints.conversationContentFragments(workspaceId, conversationId),
            payload,
            tokenProvider,
        )
    }

    suspend fun fetchAttachments(
        workspaceId: String,
        conversationId: String,
        tokenProvider: TokenProvider,
    ) = apiClient.authenticatedGet<ConversationAttachmentsResponse>(
        Endpoints.conversationAttachments(workspaceId, conversationId),
        tokenProvider,
    ).attachments.filterNot { it.hidden }

    suspend fun fetchFileData(
        workspaceId: String,
        fileId: String,
        tokenProvider: TokenProvider,
    ): ByteArray = apiClient.authenticatedRawGet(Endpoints.fileView(workspaceId, fileId), tokenProvider)

    suspend fun fetchFileContent(
        workspaceId: String,
        fileId: String,
        tokenProvider: TokenProvider,
    ): FrameFileContent {
        val response = apiClient.authenticatedRawGetResponse(
            Endpoints.fileView(workspaceId, fileId),
            tokenProvider,
        )
        return FrameFileContent(
            data = response.body,
            contentType = response.headers["Content-Type"] ?: response.headers["content-type"],
        )
    }
}

data class FrameFileContent(
    val data: ByteArray,
    val contentType: String?,
)

@Serializable
private enum class FileUploadUseCase {
    @SerialName("conversation")
    CONVERSATION,
}

@Serializable
private data class ConversationFileUploadRequest(
    val contentType: String,
    val fileName: String,
    val fileSize: Int,
    val useCase: FileUploadUseCase = FileUploadUseCase.CONVERSATION,
)
