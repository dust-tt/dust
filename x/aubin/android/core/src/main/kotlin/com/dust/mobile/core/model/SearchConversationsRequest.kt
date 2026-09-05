package com.dust.mobile.core.model

import kotlinx.serialization.Serializable

@Serializable
data class SearchConversationsRequest(
    val query: String,
    val limit: Int = 20,
    val lastValue: String? = null,
)
