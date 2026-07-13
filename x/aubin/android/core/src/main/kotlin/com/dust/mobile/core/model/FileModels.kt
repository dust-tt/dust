package com.dust.mobile.core.model

import kotlinx.serialization.Serializable
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.nio.charset.StandardCharsets

@Serializable
data class FileUploadRequest(
    val contentType: String,
    val fileName: String,
    val fileSize: Int,
    val useCase: String = "conversation",
)

@Serializable
data class UploadedFile(
    val sId: String,
    val uploadUrl: String,
)

@Serializable
data class FileUploadResponse(
    val file: UploadedFile,
)

@Serializable
data class UploadedFileResult(
    val sId: String,
    val downloadUrl: String? = null,
)

@Serializable
data class FileUploadedResponse(
    val file: UploadedFileResult,
)

@Serializable
data class ConversationAttachment(
    val fileId: String? = null,
    val title: String,
    val contentType: String,
    val sourceUrl: String? = null,
    val source: String? = null,
) {
    val id: String
        get() = fileId ?: "$title-$contentType"

    val isFrame: Boolean
        get() = contentType.startsWith(FRAME_CONTENT_TYPE_PREFIX)

    val isImage: Boolean
        get() = isImageContentType(contentType)

    val isPdf: Boolean
        get() = contentType.contains("pdf", ignoreCase = true)

    val isText: Boolean
        get() = contentType.contains("text", ignoreCase = true) ||
            contentType.contains("json", ignoreCase = true) ||
            contentType.contains("xml", ignoreCase = true) ||
            contentType.contains("html", ignoreCase = true)

    val category: AttachmentCategory
        get() = when {
            isFrame -> AttachmentCategory.FRAME
            isImage -> AttachmentCategory.IMAGE
            isPdf || isText -> AttachmentCategory.DOCUMENT
            else -> AttachmentCategory.OTHER
        }
}

enum class AttachmentCategory(val displayName: String) {
    FRAME("Frames"),
    IMAGE("Images"),
    DOCUMENT("Documents"),
    OTHER("Other"),
}

enum class AttachmentPreviewRoute {
    FRAME,
    IMAGE,
    PDF,
    TEXT,
    OTHER,
}

const val FRAME_CONTENT_TYPE_PREFIX = "application/vnd.dust.frame"

fun attachmentPreviewRoute(contentType: String, data: ByteArray): AttachmentPreviewRoute {
    val textPreview = decodeUtf8TextOrNull(data)
    return when {
        contentType.startsWith(FRAME_CONTENT_TYPE_PREFIX) ->
            if (textPreview != null) AttachmentPreviewRoute.FRAME else AttachmentPreviewRoute.OTHER
        isImageContentType(contentType) -> AttachmentPreviewRoute.IMAGE
        contentType.contains("pdf", ignoreCase = true) -> AttachmentPreviewRoute.PDF
        textPreview != null -> AttachmentPreviewRoute.TEXT
        else -> AttachmentPreviewRoute.OTHER
    }
}

fun iconLabelForContentType(contentType: String): String =
    when {
        contentType.startsWith(FRAME_CONTENT_TYPE_PREFIX) -> "Frame"
        isImageContentType(contentType) -> "Image"
        contentType.contains("pdf", ignoreCase = true) -> "PDF"
        contentType.contains("spreadsheet", ignoreCase = true) ||
            contentType.contains("sheet", ignoreCase = true) -> "Sheet"
        contentType.contains("text", ignoreCase = true) ||
            contentType.contains("json", ignoreCase = true) ||
            contentType.contains("xml", ignoreCase = true) ||
            contentType.contains("html", ignoreCase = true) -> "Text"
        contentType.contains("csv", ignoreCase = true) -> "Sheet"
        else -> "File"
    }

fun isImageContentType(contentType: String): Boolean =
    contentType.startsWith("image/")

fun decodeUtf8TextOrNull(data: ByteArray): String? =
    runCatching {
        StandardCharsets.UTF_8
            .newDecoder()
            .onMalformedInput(CodingErrorAction.REPORT)
            .onUnmappableCharacter(CodingErrorAction.REPORT)
            .decode(ByteBuffer.wrap(data))
            .toString()
    }.getOrNull()

@Serializable
data class ConversationAttachmentsResponse(
    val attachments: List<ConversationAttachment>,
)
