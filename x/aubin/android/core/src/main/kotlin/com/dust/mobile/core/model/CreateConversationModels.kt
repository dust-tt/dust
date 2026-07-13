package com.dust.mobile.core.model

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable

@Serializable
data class CreateConversationRequest(
    val title: String? = null,
    val visibility: String = "unlisted",
    val spaceId: String? = null,
    val message: CreateMessagePayload,
    val contentFragments: List<ContentFragmentPayload> = emptyList(),
)

@Serializable
data class CreateMessagePayload(
    val content: String,
    val mentions: List<MentionPayload>,
    val context: MessageContext,
)

@Serializable
data class MentionPayload(
    val configurationId: String,
)

@Serializable
data class MessageContext(
    val timezone: String,
    val profilePictureUrl: String? = null,
    @OptIn(ExperimentalSerializationApi::class)
    @EncodeDefault(EncodeDefault.Mode.NEVER)
    val selectedMCPServerViewIds: List<String>? = null,
)

@Serializable
data class PostMessageRequest(
    val content: String,
    val mentions: List<MentionPayload>,
    val context: MessageContext,
)

@Serializable
data class PostMessageResponse(
    val message: UserMessage,
)

@Serializable
data class ContentFragmentPayload(
    val title: String,
    @OptIn(ExperimentalSerializationApi::class)
    @EncodeDefault(EncodeDefault.Mode.NEVER)
    val fileId: String? = null,
    @OptIn(ExperimentalSerializationApi::class)
    @EncodeDefault(EncodeDefault.Mode.NEVER)
    val nodeId: String? = null,
    @OptIn(ExperimentalSerializationApi::class)
    @EncodeDefault(EncodeDefault.Mode.NEVER)
    val nodeDataSourceViewId: String? = null,
    @OptIn(ExperimentalSerializationApi::class)
    @EncodeDefault(EncodeDefault.Mode.NEVER)
    val url: String? = null,
    val context: ContentFragmentContext,
) {
    companion object {
        fun file(title: String, fileId: String, context: ContentFragmentContext): ContentFragmentPayload =
            ContentFragmentPayload(title = title, fileId = fileId, context = context)

        fun node(
            title: String,
            nodeId: String,
            nodeDataSourceViewId: String,
            context: ContentFragmentContext,
        ): ContentFragmentPayload =
            ContentFragmentPayload(
                title = title,
                nodeId = nodeId,
                nodeDataSourceViewId = nodeDataSourceViewId,
                context = context,
            )
    }
}

@Serializable
data class ContentFragmentContext(
    val profilePictureUrl: String? = null,
)

@Serializable
data class PostContentFragmentRequest(
    val title: String,
    @OptIn(ExperimentalSerializationApi::class)
    @EncodeDefault(EncodeDefault.Mode.NEVER)
    val fileId: String? = null,
    @OptIn(ExperimentalSerializationApi::class)
    @EncodeDefault(EncodeDefault.Mode.NEVER)
    val nodeId: String? = null,
    @OptIn(ExperimentalSerializationApi::class)
    @EncodeDefault(EncodeDefault.Mode.NEVER)
    val nodeDataSourceViewId: String? = null,
    @OptIn(ExperimentalSerializationApi::class)
    @EncodeDefault(EncodeDefault.Mode.NEVER)
    val url: String? = null,
    val context: ContentFragmentContext,
) {
    companion object {
        fun from(payload: ContentFragmentPayload): PostContentFragmentRequest =
            PostContentFragmentRequest(
                title = payload.title,
                fileId = payload.fileId,
                nodeId = payload.nodeId,
                nodeDataSourceViewId = payload.nodeDataSourceViewId,
                url = payload.url,
                context = payload.context,
            )
    }
}

@Serializable
data class PostContentFragmentResponse(
    val contentFragment: ContentFragmentInfo,
)

@Serializable
data class ContentFragmentInfo(
    val sId: String,
)
