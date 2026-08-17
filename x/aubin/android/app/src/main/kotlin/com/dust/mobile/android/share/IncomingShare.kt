package com.dust.mobile.android.share

import android.content.Intent
import android.net.Uri
import android.os.Build

internal data class IncomingShare(
    val id: Long,
    val text: String?,
    val uris: List<Uri>,
    val targetWorkspaceId: String? = null,
    val targetAgentId: String? = null,
    val shortcutId: String? = null,
)

internal fun Intent.toIncomingShare(id: Long = System.nanoTime()): IncomingShare? {
    if (action != Intent.ACTION_SEND && action != Intent.ACTION_SEND_MULTIPLE) {
        return null
    }

    val sharedText = getCharSequenceExtra(Intent.EXTRA_TEXT)
        ?.toString()
        ?.takeIf { it.isNotBlank() }
        ?: getCharSequenceExtra(Intent.EXTRA_SUBJECT)
            ?.toString()
            ?.takeIf { it.isNotBlank() }
    val uris = linkedSetOf<Uri>()
    if (action == Intent.ACTION_SEND) {
        parcelableUriExtra(Intent.EXTRA_STREAM)?.let(uris::add)
    } else {
        parcelableUriListExtra(Intent.EXTRA_STREAM).forEach(uris::add)
    }
    clipData?.let { clips ->
        for (index in 0 until clips.itemCount) {
            clips.getItemAt(index).uri?.let(uris::add)
        }
    }

    if (sharedText == null && uris.isEmpty()) return null
    return IncomingShare(
        id = id,
        text = sharedText,
        uris = uris.toList(),
        targetWorkspaceId = getStringExtra(EXTRA_TARGET_WORKSPACE_ID),
        targetAgentId = getStringExtra(EXTRA_TARGET_AGENT_ID),
        shortcutId = getStringExtra(EXTRA_TARGET_SHORTCUT_ID),
    )
}

internal const val DIRECT_SHARE_CATEGORY = "com.dust.mobile.category.AGENT_SHARE_TARGET"
internal const val EXTRA_TARGET_WORKSPACE_ID = "com.dust.mobile.extra.TARGET_WORKSPACE_ID"
internal const val EXTRA_TARGET_AGENT_ID = "com.dust.mobile.extra.TARGET_AGENT_ID"
internal const val EXTRA_TARGET_SHORTCUT_ID = "com.dust.mobile.extra.TARGET_SHORTCUT_ID"

@Suppress("DEPRECATION")
private fun Intent.parcelableUriExtra(key: String): Uri? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        getParcelableExtra(key, Uri::class.java)
    } else {
        getParcelableExtra(key)
    }

@Suppress("DEPRECATION")
private fun Intent.parcelableUriListExtra(key: String): List<Uri> =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        getParcelableArrayListExtra(key, Uri::class.java).orEmpty()
    } else {
        getParcelableArrayListExtra<Uri>(key).orEmpty()
    }
