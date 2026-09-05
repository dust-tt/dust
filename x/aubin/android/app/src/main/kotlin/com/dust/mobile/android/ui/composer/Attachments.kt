package com.dust.mobile.android.ui.composer

import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.model.ContentFragmentContext
import com.dust.mobile.core.model.ContentFragmentPayload
import java.util.UUID
import kotlinx.coroutines.CancellationException

data class AttachmentDraft(
    val id: String = UUID.randomUUID().toString(),
    val fileName: String,
    val contentType: String,
    val fileSize: Int,
    val data: ByteArray,
    val thumbnailData: ByteArray? = null,
    val uploadState: AttachmentUploadState = AttachmentUploadState.Pending,
) {
    val fileId: String?
        get() = (uploadState as? AttachmentUploadState.Uploaded)?.fileId

    val thumbnailSourceData: ByteArray?
        get() = thumbnailData ?: data.takeIf { it.isNotEmpty() }

    override fun equals(other: Any?): Boolean =
        other is AttachmentDraft &&
            id == other.id &&
            fileName == other.fileName &&
            contentType == other.contentType &&
            fileSize == other.fileSize &&
            data.contentEquals(other.data) &&
            thumbnailData.contentEqualsNullable(other.thumbnailData) &&
            uploadState == other.uploadState

    override fun hashCode(): Int {
        var result = id.hashCode()
        result = 31 * result + fileName.hashCode()
        result = 31 * result + contentType.hashCode()
        result = 31 * result + fileSize
        result = 31 * result + data.contentHashCode()
        result = 31 * result + (thumbnailData?.contentHashCode() ?: 0)
        result = 31 * result + uploadState.hashCode()
        return result
    }
}

sealed interface AttachmentUploadState {
    data object Pending : AttachmentUploadState
    data object Uploading : AttachmentUploadState
    data class Uploaded(val fileId: String) : AttachmentUploadState
    data class Failed(val message: String) : AttachmentUploadState
}

internal val List<AttachmentDraft>.hasFailedUploads: Boolean
    get() = any { it.uploadState is AttachmentUploadState.Failed }

internal fun List<AttachmentDraft>.replaceAttachment(updated: AttachmentDraft): List<AttachmentDraft> =
    map { if (it.id == updated.id) updated else it }

internal fun List<AttachmentDraft>.failedUploadMessage(): String? =
    firstNotNullOfOrNull { attachment ->
        (attachment.uploadState as? AttachmentUploadState.Failed)?.message
    }

internal fun List<AttachmentDraft>.uploadedAttachments(): List<UploadedAttachment> =
    mapNotNull { attachment ->
        attachment.fileId?.let { UploadedAttachment(fileName = attachment.fileName, fileId = it) }
    }

internal suspend fun uploadAttachmentDraft(
    graph: AppGraph,
    tokenProvider: TokenProvider,
    workspaceId: String,
    attachment: AttachmentDraft,
    onUpdate: (AttachmentDraft) -> Unit,
): UploadedAttachment {
    onUpdate(attachment.copy(uploadState = AttachmentUploadState.Uploading))
    return try {
        val fileId = graph.fileRepository.uploadFile(
            workspaceId = workspaceId,
            fileName = attachment.fileName,
            contentType = attachment.contentType,
            fileData = attachment.data,
            tokenProvider = tokenProvider,
        )
        onUpdate(attachment.markUploaded(fileId))
        UploadedAttachment(attachment.fileName, fileId)
    } catch (error: CancellationException) {
        throw error
    } catch (error: Throwable) {
        onUpdate(attachment.copy(uploadState = AttachmentUploadState.Failed(error.message ?: "Upload failed")))
        throw error
    }
}

internal fun replyContentFragmentPayloads(
    uploadedAttachments: List<UploadedAttachment>,
    profilePictureUrl: String?,
): List<ContentFragmentPayload> {
    val context = ContentFragmentContext(profilePictureUrl = profilePictureUrl)
    return uploadedAttachments.map { attachment ->
        ContentFragmentPayload.file(
            title = attachment.fileName,
            fileId = attachment.fileId,
            context = context,
        )
    }
}

internal data class UploadedAttachment(
    val fileName: String,
    val fileId: String,
)

internal fun AttachmentDraft.markUploaded(fileId: String): AttachmentDraft =
    copy(data = ByteArray(0), uploadState = AttachmentUploadState.Uploaded(fileId))

internal fun AttachmentDraft.markUploadCanceled(): AttachmentDraft =
    when (uploadState) {
        AttachmentUploadState.Pending,
        AttachmentUploadState.Uploading -> copy(uploadState = AttachmentUploadState.Failed("Upload canceled"))
        is AttachmentUploadState.Failed,
        is AttachmentUploadState.Uploaded -> this
    }

internal fun List<AttachmentDraft>.markUploadsCanceled(attachmentIds: Set<String>): List<AttachmentDraft> =
    map { attachment ->
        if (attachment.id in attachmentIds) {
            attachment.markUploadCanceled()
        } else {
            attachment
        }
    }

internal fun ByteArray?.contentEqualsNullable(other: ByteArray?): Boolean =
    when {
        this == null -> other == null
        other == null -> false
        else -> contentEquals(other)
    }

internal const val PHOTO_PICKER_MAX_ITEMS = 10
