package com.dust.mobile.core

import com.dust.mobile.core.model.buildFrameWrapperHtml
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FrameHtmlTest {
    @Test
    fun `frame wrapper points viz iframe at the file identifier`() {
        val html = buildFrameWrapperHtml(
            code = "return 1",
            fileId = "file_123",
            vizUrl = "https://viz.dust.tt",
        )

        assertTrue(html.contains("""src="https://viz.dust.tt/content?identifier=viz-file_123&fullHeight=true""""))
        assertTrue(html.contains("const IDENTIFIER = 'viz-file_123';"))
    }

    @Test
    fun `frame wrapper exposes code and file RPC hooks`() {
        val html = buildFrameWrapperHtml(
            code = "render()",
            fileId = "file_123",
            vizUrl = "https://viz.dust.tt",
        )

        assertTrue(html.contains("data.command === 'getCodeToExecute'"))
        assertTrue(html.contains("window.DustFrameBridge.getFile(data.messageUniqueId, data.params.fileId);"))
        assertTrue(html.contains("window.__dustAnswerFile = function(messageUniqueId, base64, contentType)"))
        assertTrue(html.contains("fileBlob: new Blob([bytes], { type: contentType || 'application/octet-stream' })"))
        assertTrue(html.contains("window.DustFrameBridge.setErrorMessage(data.params.errorMessage);"))
    }

    @Test
    fun `frame wrapper escapes code before embedding in template literal`() {
        val html = buildFrameWrapperHtml(
            code = """const value = `template ${'$'}{x}`; </script> \ end""",
            fileId = "file_123",
            vizUrl = "https://viz.dust.tt",
        )

        assertTrue(html.contains("""const FRAME_CODE = `const value = \`template \${'$'}{x}\`; <\/script> \\ end`;"""))
        assertFalse(html.contains("const value = `template ${'$'}{x}`; </script> \\ end"))
    }
}
