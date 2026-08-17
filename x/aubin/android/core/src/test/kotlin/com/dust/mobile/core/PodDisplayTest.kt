package com.dust.mobile.core

import com.dust.mobile.core.model.PodFileEntry
import com.dust.mobile.core.model.formatFileSize
import com.dust.mobile.core.model.podFileChildren
import org.junit.Assert.assertEquals
import org.junit.Test

class PodDisplayTest {
    @Test
    fun `pod file children only returns the active folder`() {
        val files = listOf(
            directory("pod-p1/Research", "Research"),
            file("pod-p1/brief.pdf", "brief.pdf"),
            file("pod-p1/Research/notes.md", "notes.md"),
            file("pod-p1/Research/Nested/source.txt", "source.txt"),
        )

        assertEquals(
            listOf("Research", "brief.pdf"),
            podFileChildren(files, "p1", "").map { it.fileName },
        )
        assertEquals(
            listOf("notes.md"),
            podFileChildren(files, "p1", "Research").map { it.fileName },
        )
    }

    @Test
    fun `pod files sort folders before files alphabetically`() {
        val files = listOf(
            file("pod-p1/zeta.txt", "zeta.txt"),
            directory("pod-p1/Archive", "Archive"),
            file("pod-p1/alpha.txt", "alpha.txt"),
        )

        assertEquals(
            listOf("Archive", "alpha.txt", "zeta.txt"),
            podFileChildren(files, "p1", "").map { it.fileName },
        )
    }

    @Test
    fun `file sizes use compact binary units`() {
        assertEquals("800 B", formatFileSize(800))
        assertEquals("2 KB", formatFileSize(2_048))
        assertEquals("3 MB", formatFileSize(3L * 1_024 * 1_024))
    }
}

private fun directory(path: String, name: String) = PodFileEntry(
    fileName = name,
    path = path,
    isDirectory = true,
)

private fun file(path: String, name: String) = PodFileEntry(
    fileName = name,
    path = path,
    sizeBytes = 1,
    isDirectory = false,
    contentType = "text/plain",
    fileId = "file-$name",
)
