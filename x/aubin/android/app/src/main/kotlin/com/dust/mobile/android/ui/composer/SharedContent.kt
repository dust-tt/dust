package com.dust.mobile.android.ui.composer

internal fun appendSharedText(current: String, shared: String?): String {
    val incoming = shared?.trim()?.takeIf { it.isNotEmpty() } ?: return current
    return if (current.isBlank()) incoming else "${current.trimEnd()}\n\n$incoming"
}
