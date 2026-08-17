package com.dust.mobile.android.ui.composer

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.provider.OpenableColumns
import java.io.ByteArrayOutputStream
import java.io.IOException
import kotlin.math.max

data class PickedFile(
    val fileName: String,
    val contentType: String,
    val data: ByteArray,
    val thumbnailData: ByteArray? = null,
)

fun readPickedFile(context: Context, uri: Uri): PickedFile? {
    val resolver = context.contentResolver
    val fileName = resolver.query(uri, null, null, null, null)?.use { cursor ->
        val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        if (cursor.moveToFirst() && nameIndex >= 0) cursor.getString(nameIndex) else null
    } ?: uri.lastPathSegment ?: "attachment"
    val contentType = resolvePickedFileContentType(
        reportedType = resolver.getType(uri),
        fileName = fileName,
        uriPath = uri.lastPathSegment,
    )
    val data = resolver.openInputStream(uri)?.use { it.readBytes() } ?: return null
    return PickedFile(
        fileName = fileName,
        contentType = contentType,
        data = data,
        thumbnailData = buildThumbnailData(data, contentType),
    )
}

fun readPickedFileSafely(context: Context, uri: Uri): PickedFile? =
    try {
        readPickedFile(context, uri)
    } catch (_: IOException) {
        null
    } catch (_: SecurityException) {
        null
    } catch (_: IllegalArgumentException) {
        null
    }

internal fun resolvePickedFileContentType(
    reportedType: String?,
    fileName: String?,
    uriPath: String?,
): String {
    val normalizedType = reportedType?.takeIf { it.isNotBlank() }
    if (normalizedType != null && normalizedType != DEFAULT_PICKED_FILE_CONTENT_TYPE) {
        return normalizedType
    }

    return inferContentTypeFromFileName(fileName)
        ?: inferContentTypeFromFileName(uriPath)
        ?: normalizedType
        ?: DEFAULT_PICKED_FILE_CONTENT_TYPE
}

private fun inferContentTypeFromFileName(name: String?): String? {
    val extension = name
        ?.substringBefore('?')
        ?.substringBefore('#')
        ?.substringAfterLast('.', missingDelimiterValue = "")
        ?.lowercase()
        ?.takeIf { it.isNotBlank() }

    return when (extension) {
        "pdf" -> "application/pdf"
        "txt", "text", "log" -> "text/plain"
        "csv" -> "text/csv"
        "json" -> "application/json"
        "xml" -> "application/xml"
        "html", "htm" -> "text/html"
        "xhtml" -> "application/xhtml+xml"
        "png" -> "image/png"
        "jpg", "jpeg" -> "image/jpeg"
        "gif" -> "image/gif"
        "webp" -> "image/webp"
        "doc" -> "application/msword"
        "docx" -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        "xls" -> "application/vnd.ms-excel"
        "xlsx" -> "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        "ppt" -> "application/vnd.ms-powerpoint"
        "pptx" -> "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        "ods" -> "application/vnd.oasis.opendocument.spreadsheet"
        else -> null
    }
}

private fun buildThumbnailData(data: ByteArray, contentType: String): ByteArray? {
    if (!contentType.startsWith("image/")) return null

    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(data, 0, data.size, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

    val sampled = BitmapFactory.decodeByteArray(
        data,
        0,
        data.size,
        BitmapFactory.Options().apply {
            inSampleSize = thumbnailSampleSize(bounds.outWidth, bounds.outHeight)
        },
    ) ?: return null

    val thumbnail = sampled.scaleDownToThumbnail()
    return try {
        ByteArrayOutputStream().use { output ->
            val format = if (contentType.equals("image/png", ignoreCase = true)) {
                Bitmap.CompressFormat.PNG
            } else {
                Bitmap.CompressFormat.JPEG
            }
            if (thumbnail.compress(format, THUMBNAIL_QUALITY, output)) output.toByteArray() else null
        }
    } finally {
        if (thumbnail !== sampled) {
            thumbnail.recycle()
        }
        sampled.recycle()
    }
}

private fun thumbnailSampleSize(width: Int, height: Int): Int {
    var sampleSize = 1
    while (width / (sampleSize * 2) >= THUMBNAIL_MAX_DIMENSION_PX ||
        height / (sampleSize * 2) >= THUMBNAIL_MAX_DIMENSION_PX
    ) {
        sampleSize *= 2
    }
    return sampleSize
}

private fun Bitmap.scaleDownToThumbnail(): Bitmap {
    val longestSide = max(width, height)
    if (longestSide <= THUMBNAIL_MAX_DIMENSION_PX) return this

    val scale = THUMBNAIL_MAX_DIMENSION_PX.toFloat() / longestSide
    return Bitmap.createScaledBitmap(
        this,
        (width * scale).toInt().coerceAtLeast(1),
        (height * scale).toInt().coerceAtLeast(1),
        true,
    )
}

private const val THUMBNAIL_MAX_DIMENSION_PX = 160
private const val THUMBNAIL_QUALITY = 82
private const val DEFAULT_PICKED_FILE_CONTENT_TYPE = "application/octet-stream"
