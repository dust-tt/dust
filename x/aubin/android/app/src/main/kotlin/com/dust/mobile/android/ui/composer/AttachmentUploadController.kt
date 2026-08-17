package com.dust.mobile.android.ui.composer

import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.core.auth.TokenProvider
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

internal class AttachmentUploadController(
    private val graph: AppGraph,
    private val tokenProvider: TokenProvider,
    private val workspaceId: String,
    private val isLocalPreview: Boolean,
    private val coroutineScope: CoroutineScope,
    private val currentAttachments: () -> List<AttachmentDraft>,
    private val updateAttachments: (
        transform: (List<AttachmentDraft>) -> List<AttachmentDraft>,
    ) -> Unit,
) {
    private val uploadJobs = mutableMapOf<String, Job>()

    fun add(
        fileName: String,
        contentType: String,
        data: ByteArray,
        thumbnailData: ByteArray? = null,
    ) {
        val attachment = AttachmentDraft(
            fileName = fileName,
            contentType = contentType,
            fileSize = data.size,
            data = data,
            thumbnailData = thumbnailData,
        )
        updateAttachments { it + attachment }
        startUpload(attachment)
    }

    fun remove(id: String) {
        uploadJobs.remove(id)?.cancel()
        updateAttachments { attachments ->
            attachments.filterNot { attachment -> attachment.id == id }
        }
    }

    fun cancel() {
        val canceledAttachmentIds = uploadJobs.keys.toSet()
        uploadJobs.values.forEach { it.cancel() }
        uploadJobs.clear()
        if (canceledAttachmentIds.isNotEmpty()) {
            updateAttachments { it.markUploadsCanceled(canceledAttachmentIds) }
        }
    }

    suspend fun awaitUploaded(): List<UploadedAttachment> {
        uploadJobs.values.toList().forEach { it.join() }
        currentAttachments()
            .filter { it.uploadState is AttachmentUploadState.Pending }
            .forEach { attachment -> upload(attachment) }
        currentAttachments().failedUploadMessage()?.let { throw IllegalStateException(it) }
        return currentAttachments().uploadedAttachments()
    }

    private fun startUpload(attachment: AttachmentDraft) {
        if (isLocalPreview) {
            updateAttachment(attachment.markUploaded("local-file-${attachment.id}"))
            return
        }
        uploadJobs[attachment.id]?.cancel()
        uploadJobs[attachment.id] = coroutineScope.launch {
            try {
                upload(attachment)
            } catch (error: CancellationException) {
                throw error
            } catch (_: Throwable) {
                // uploadAttachmentDraft already publishes the failed state.
            } finally {
                uploadJobs.remove(attachment.id)
            }
        }
    }

    private suspend fun upload(attachment: AttachmentDraft) {
        uploadAttachmentDraft(
            graph = graph,
            tokenProvider = tokenProvider,
            workspaceId = workspaceId,
            attachment = attachment,
            onUpdate = ::updateAttachment,
        )
    }

    private fun updateAttachment(attachment: AttachmentDraft) {
        updateAttachments { it.replaceAttachment(attachment) }
    }
}
