package com.dust.mobile.core.model

fun replyCountLabel(replyCount: Int): String? =
    when {
        replyCount <= 0 -> null
        replyCount == 1 -> "1 reply"
        else -> "$replyCount replies"
    }

fun List<Conversation>.filteredByTitleSearch(searchText: String): List<Conversation> =
    if (searchText.isEmpty()) {
        this
    } else {
        filter { conversation ->
            conversation.title?.contains(searchText, ignoreCase = true) == true
        }
    }

fun List<Conversation>.withUpdatedTitle(conversationId: String, title: String): List<Conversation> =
    map { conversation ->
        if (conversation.sId == conversationId) {
            conversation.copy(title = title)
        } else {
            conversation
        }
    }
