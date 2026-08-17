package com.dust.mobile.android.ui.inbox

import com.dust.mobile.core.model.Conversation
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

data class ConversationGroup(
    val label: String,
    val conversations: List<Conversation>,
)

internal fun groupByDate(conversations: List<Conversation>): List<ConversationGroup> {
    val zone = ZoneId.systemDefault()
    val today = LocalDate.now(zone)
    val buckets = linkedMapOf(
        "Today" to mutableListOf<Conversation>(),
        "Yesterday" to mutableListOf(),
        "Last Week" to mutableListOf(),
        "Last Month" to mutableListOf(),
        "Last 12 Months" to mutableListOf(),
        "Older" to mutableListOf(),
    )
    conversations.forEach { conversation ->
        val date = Instant.ofEpochMilli(conversation.effectiveEpochMs.toLong()).atZone(zone).toLocalDate()
        val label = when {
            date >= today -> "Today"
            date >= today.minusDays(1) -> "Yesterday"
            date >= today.minusDays(7) -> "Last Week"
            date >= today.minusMonths(1) -> "Last Month"
            date >= today.minusYears(1) -> "Last 12 Months"
            else -> "Older"
        }
        buckets.getValue(label).add(conversation)
    }
    return buckets.mapNotNull { (label, items) ->
        if (items.isEmpty()) null else ConversationGroup(label, items)
    }
}
