package com.dust.mobile.core

import com.dust.mobile.core.model.SUPPORTED_UPLOAD_MIME_TYPES
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SupportedUploadTypesTest {
    @Test
    fun `supported upload types match the native document picker contract`() {
        assertTrue(SUPPORTED_UPLOAD_MIME_TYPES.contains("application/pdf"))
        assertTrue(SUPPORTED_UPLOAD_MIME_TYPES.contains("text/plain"))
        assertTrue(SUPPORTED_UPLOAD_MIME_TYPES.contains("image/*"))
        assertTrue(SUPPORTED_UPLOAD_MIME_TYPES.contains("text/csv"))
        assertTrue(
            SUPPORTED_UPLOAD_MIME_TYPES.contains(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ),
        )
        assertTrue(SUPPORTED_UPLOAD_MIME_TYPES.contains("application/json"))
        assertTrue(SUPPORTED_UPLOAD_MIME_TYPES.contains("application/xml"))
        assertTrue(SUPPORTED_UPLOAD_MIME_TYPES.contains("text/html"))
    }

    @Test
    fun `supported upload types do not expose the all files wildcard`() {
        assertFalse(SUPPORTED_UPLOAD_MIME_TYPES.contains("*/*"))
    }
}
