package com.dust.mobile.core.model

fun shouldOpenAgentPicker(text: String): Boolean {
    if (!text.endsWith("@")) return false
    val beforeAt = text.dropLast(1)
    return beforeAt.isEmpty() || beforeAt.last().isWhitespace()
}

fun removeTrailingAgentPickerTrigger(text: String): String =
    if (shouldOpenAgentPicker(text)) text.dropLast(1) else text
