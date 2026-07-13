package com.dust.mobile.core.model

fun buildUserQuestionAnswer(
    selectedOptions: Collection<Int>,
    customResponse: String,
): UserQuestionAnswer? {
    val trimmedResponse = customResponse.trim()
    if (selectedOptions.isEmpty() && trimmedResponse.isEmpty()) {
        return null
    }

    return UserQuestionAnswer(
        selectedOptions = selectedOptions.toSet().sorted(),
        customResponse = trimmedResponse.ifEmpty { null },
    )
}
