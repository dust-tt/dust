package com.dust.mobile.core.network

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.json.Json

@OptIn(ExperimentalSerializationApi::class)
val DustJson = Json {
    ignoreUnknownKeys = true
    encodeDefaults = true
    explicitNulls = true
}
