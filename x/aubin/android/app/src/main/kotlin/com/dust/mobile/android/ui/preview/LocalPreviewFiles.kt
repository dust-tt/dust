package com.dust.mobile.android.ui.preview

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import com.dust.mobile.core.model.ConversationAttachment
import com.dust.mobile.core.model.FRAME_CONTENT_TYPE_PREFIX
import java.io.ByteArrayOutputStream

internal fun localPreviewAttachments(conversationId: String): List<ConversationAttachment> =
    listOf(
        ConversationAttachment(
            fileId = "local-file-$conversationId-frame",
            title = "Account briefing",
            contentType = FRAME_CONTENT_TYPE_PREFIX,
            source = "Dust",
        ),
        ConversationAttachment(
            fileId = "local-file-$conversationId-image",
            title = "Account health.png",
            contentType = "image/png",
            source = "Dust",
        ),
        ConversationAttachment(
            fileId = "local-file-$conversationId-summary",
            title = "Briefing summary.md",
            contentType = "text/markdown",
            source = "Dust",
        ),
        ConversationAttachment(
            fileId = "local-file-$conversationId-checklist",
            title = "Account checklist.txt",
            contentType = "text/plain",
            source = "Dust",
        ),
        ConversationAttachment(
            fileId = "local-file-$conversationId-pdf",
            title = "Customer brief.pdf",
            contentType = "application/pdf",
            source = "Dust",
        ),
        ConversationAttachment(
            fileId = "local-file-$conversationId-binary",
            title = "Research archive.bin",
            contentType = "application/octet-stream",
            source = "Dust",
        ),
    )

internal fun localPreviewFileData(fileId: String): ByteArray =
    when {
        fileId.contains("frame", ignoreCase = true) -> """
        export default function AccountBriefing() {
          const priorities = [
            ["Customer story", "Ready for review"],
            ["Open risks", "3 owners assigned"],
            ["Next step", "Send before Friday"],
          ];

          return (
            <main className="min-h-screen bg-white p-6 text-neutral-950">
              <p className="text-sm font-medium text-neutral-500">Q3 account review</p>
              <h1 className="mt-2 text-3xl font-semibold">Customer briefing</h1>
              <div className="mt-8 grid gap-3">
                {priorities.map(([label, value]) => (
                  <section key={label} className="rounded-lg border border-neutral-200 p-4">
                    <p className="text-sm text-neutral-500">{label}</p>
                    <p className="mt-1 text-lg font-medium">{value}</p>
                  </section>
                ))}
              </div>
              <label className="mt-6 block text-sm font-medium text-neutral-700">
                Reviewer note
                <input
                  aria-label="Reviewer note"
                  className="mt-2 w-full rounded-lg border border-neutral-200 px-3 py-3 text-base"
                  enterKeyHint="done"
                  placeholder="Add a note"
                  type="text"
                />
              </label>
            </main>
          );
        }
        """.trimIndent().toByteArray()
        fileId.contains("image", ignoreCase = true) -> localPreviewImageData()
        fileId.contains("pdf", ignoreCase = true) -> localPreviewPdfData()
        fileId.contains("binary", ignoreCase = true) -> byteArrayOf(0xC3.toByte(), 0x28)
        fileId.contains("checklist", ignoreCase = true) -> """
        # Account review checklist

        - Confirm the customer story and latest account notes.
        - Assign an owner for every open risk.
        - Attach source material before sending the briefing.
        - Share next steps with the account team after the review.
        """.trimIndent().toByteArray()
        else -> """
        # Customer briefing summary

        The account is ready for review. Recent workspace activity points to three priorities:

        - Align the customer story with the latest support notes.
        - Keep the action list short enough to review on mobile.
        - Attach source material before handing the briefing to the team.

        Use this as a starting point before the customer call.
        """.trimIndent().toByteArray()
    }

internal fun localPreviewImageData(): ByteArray {
    val bitmap = Bitmap.createBitmap(720, 480, Bitmap.Config.ARGB_8888)
    return try {
        val canvas = Canvas(bitmap)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        canvas.drawColor(Color.rgb(247, 246, 242))

        paint.color = Color.rgb(23, 23, 23)
        paint.textSize = 44f
        paint.isFakeBoldText = true
        canvas.drawText("Account health", 48f, 82f, paint)

        paint.isFakeBoldText = false
        paint.color = Color.rgb(111, 107, 100)
        paint.textSize = 26f
        canvas.drawText("Q3 customer review", 48f, 124f, paint)

        paint.color = Color.WHITE
        canvas.drawRoundRect(48f, 164f, 672f, 412f, 24f, 24f, paint)
        paint.color = Color.rgb(33, 150, 243)
        canvas.drawRoundRect(88f, 212f, 208f, 364f, 18f, 18f, paint)
        paint.color = Color.rgb(23, 23, 23)
        paint.textSize = 34f
        paint.isFakeBoldText = true
        canvas.drawText("Ready for review", 248f, 270f, paint)
        paint.isFakeBoldText = false
        paint.color = Color.rgb(111, 107, 100)
        paint.textSize = 25f
        canvas.drawText("3 owners assigned", 248f, 318f, paint)
        canvas.drawText("Next step: send Friday", 248f, 360f, paint)

        ByteArrayOutputStream().use { output ->
            check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, output))
            output.toByteArray()
        }
    } finally {
        bitmap.recycle()
    }
}

internal fun localPreviewPdfData(): ByteArray {
    val document = PdfDocument()
    return try {
        val page = document.startPage(PdfDocument.PageInfo.Builder(612, 792, 1).create())
        val canvas = page.canvas
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        canvas.drawColor(Color.WHITE)

        paint.color = Color.rgb(23, 23, 23)
        paint.textSize = 30f
        paint.isFakeBoldText = true
        canvas.drawText("Customer brief", 48f, 80f, paint)
        paint.isFakeBoldText = false
        paint.color = Color.rgb(111, 107, 100)
        paint.textSize = 18f
        canvas.drawText("Q3 account review", 48f, 116f, paint)

        paint.color = Color.rgb(23, 23, 23)
        paint.textSize = 20f
        canvas.drawText("Customer story: ready for review", 48f, 186f, paint)
        canvas.drawText("Open risks: 3 owners assigned", 48f, 230f, paint)
        canvas.drawText("Next step: send before Friday", 48f, 274f, paint)
        document.finishPage(page)

        ByteArrayOutputStream().use { output ->
            document.writeTo(output)
            output.toByteArray()
        }
    } finally {
        document.close()
    }
}
