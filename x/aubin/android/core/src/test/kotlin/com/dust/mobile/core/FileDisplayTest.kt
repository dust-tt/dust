package com.dust.mobile.core

import com.dust.mobile.core.model.AttachmentPreviewRoute
import com.dust.mobile.core.model.ConversationAttachmentsResponse
import com.dust.mobile.core.model.FRAME_CONTENT_TYPE_PREFIX
import com.dust.mobile.core.model.FileUploadedResponse
import com.dust.mobile.core.model.attachmentPreviewRoute
import com.dust.mobile.core.model.decodeUtf8TextOrNull
import com.dust.mobile.core.model.iconLabelForContentType
import com.dust.mobile.core.model.isImageContentType
import com.dust.mobile.core.network.DustJson
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class FileDisplayTest {
    @Test
    fun `content type icon labels match supported attachment categories`() {
        assertEquals("Frame", iconLabelForContentType(FRAME_CONTENT_TYPE_PREFIX))
        assertEquals("Image", iconLabelForContentType("image/png"))
        assertEquals("PDF", iconLabelForContentType("application/pdf"))
        assertEquals("Text", iconLabelForContentType("application/json"))
        assertEquals("Text", iconLabelForContentType("text/csv"))
        assertEquals(
            "Sheet",
            iconLabelForContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        )
        assertEquals("File", iconLabelForContentType("application/octet-stream"))
    }

    @Test
    fun `image content type is detected from mime prefix`() {
        assertTrue(isImageContentType("image/png"))
        assertFalse(isImageContentType("application/pdf"))
    }

    @Test
    fun `decodeUtf8TextOrNull returns text for valid UTF-8`() {
        assertEquals("plain code", decodeUtf8TextOrNull("plain code".encodeToByteArray()))
    }

    @Test
    fun `decodeUtf8TextOrNull rejects invalid UTF-8`() {
        assertNull(decodeUtf8TextOrNull(byteArrayOf(0xC3.toByte(), 0x28)))
    }

    @Test
    fun `attachmentPreviewRoute renders frames and text only with valid UTF-8`() {
        val validText = "plain code".encodeToByteArray()
        val invalidText = byteArrayOf(0xC3.toByte(), 0x28)

        assertEquals(
            AttachmentPreviewRoute.FRAME,
            attachmentPreviewRoute(FRAME_CONTENT_TYPE_PREFIX, validText),
        )
        assertEquals(
            AttachmentPreviewRoute.OTHER,
            attachmentPreviewRoute(FRAME_CONTENT_TYPE_PREFIX, invalidText),
        )
        assertEquals(
            AttachmentPreviewRoute.TEXT,
            attachmentPreviewRoute("text/plain", validText),
        )
        assertEquals(
            AttachmentPreviewRoute.OTHER,
            attachmentPreviewRoute("text/plain", invalidText),
        )
    }

    @Test
    fun `attachmentPreviewRoute keeps binary routes by content type`() {
        assertEquals(
            AttachmentPreviewRoute.IMAGE,
            attachmentPreviewRoute("image/png", byteArrayOf(0xC3.toByte(), 0x28)),
        )
        assertEquals(
            AttachmentPreviewRoute.PDF,
            attachmentPreviewRoute("application/pdf", byteArrayOf(0xC3.toByte(), 0x28)),
        )
    }

    @Test
    fun `conversation attachments response requires attachments array`() {
        assertThrows(Exception::class.java) {
            DustJson.decodeFromString<ConversationAttachmentsResponse>("{}")
        }
    }

    @Test
    fun `file uploaded response decodes uploaded file id and download url`() {
        val response = DustJson.decodeFromString<FileUploadedResponse>(
            """
            {
              "file": {
                "sId": "file_123",
                "downloadUrl": "https://dust.tt/file"
              }
            }
            """.trimIndent(),
        )

        assertEquals("file_123", response.file.sId)
        assertEquals("https://dust.tt/file", response.file.downloadUrl)
    }

    @Test
    fun `file uploaded response requires uploaded file id`() {
        assertThrows(Exception::class.java) {
            DustJson.decodeFromString<FileUploadedResponse>("""{"file":{}}""")
        }
    }
}
