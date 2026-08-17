package com.dust.mobile.android.ui.composer

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AttachmentDraftTest {
    @Test
    fun `resolvePickedFileContentType preserves concrete reported type`() {
        assertEquals(
            "image/png",
            resolvePickedFileContentType(
                reportedType = "image/png",
                fileName = "document.pdf",
                uriPath = null,
            ),
        )
    }

    @Test
    fun `resolvePickedFileContentType falls back to file extension`() {
        assertEquals(
            "application/pdf",
            resolvePickedFileContentType(
                reportedType = null,
                fileName = "brief.pdf",
                uriPath = null,
            ),
        )
        assertEquals(
            "text/csv",
            resolvePickedFileContentType(
                reportedType = "application/octet-stream",
                fileName = "report.csv",
                uriPath = null,
            ),
        )
        assertEquals(
            "application/json",
            resolvePickedFileContentType(
                reportedType = null,
                fileName = null,
                uriPath = "primary:Download/config.json",
            ),
        )
        assertEquals(
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            resolvePickedFileContentType(
                reportedType = "application/octet-stream",
                fileName = "brief.docx",
                uriPath = null,
            ),
        )
        assertEquals(
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            resolvePickedFileContentType(
                reportedType = null,
                fileName = "roadmap.pptx",
                uriPath = null,
            ),
        )
    }

    @Test
    fun `resolvePickedFileContentType uses octet stream when type is unknown`() {
        assertEquals(
            "application/octet-stream",
            resolvePickedFileContentType(
                reportedType = null,
                fileName = "archive",
                uriPath = null,
            ),
        )
    }

    @Test
    fun `markUploaded clears full data and preserves thumbnail`() {
        val thumbnailData = byteArrayOf(9, 8)
        val draft = AttachmentDraft(
            id = "attachment-1",
            fileName = "image.png",
            contentType = "image/png",
            fileSize = 4,
            data = byteArrayOf(1, 2, 3, 4),
            thumbnailData = thumbnailData,
        )

        val uploaded = draft.markUploaded("file_123")

        assertEquals("file_123", uploaded.fileId)
        assertTrue(uploaded.data.isEmpty())
        assertArrayEquals(thumbnailData, uploaded.thumbnailSourceData)
        assertEquals(AttachmentUploadState.Uploaded("file_123"), uploaded.uploadState)
    }

    @Test
    fun `markUploadCanceled marks active uploads as failed`() {
        val draft = AttachmentDraft(
            id = "attachment-1",
            fileName = "image.png",
            contentType = "image/png",
            fileSize = 4,
            data = byteArrayOf(1, 2, 3, 4),
            uploadState = AttachmentUploadState.Uploading,
        )

        val canceled = draft.markUploadCanceled()

        assertEquals(AttachmentUploadState.Failed("Upload canceled"), canceled.uploadState)
    }

    @Test
    fun `markUploadCanceled leaves completed uploads unchanged`() {
        val draft = AttachmentDraft(
            id = "attachment-1",
            fileName = "image.png",
            contentType = "image/png",
            fileSize = 4,
            data = byteArrayOf(1, 2, 3, 4),
            uploadState = AttachmentUploadState.Uploaded("file_123"),
        )

        val canceled = draft.markUploadCanceled()

        assertEquals(draft, canceled)
    }
}
