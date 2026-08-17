package com.dust.mobile.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class MessageType(val rawValue: String) {
    @SerialName("user_message")
    USER("user_message"),

    @SerialName("agent_message")
    AGENT("agent_message"),
}

@Serializable
enum class AgentMessageStatus(val rawValue: String) {
    @SerialName("created")
    CREATED("created"),

    @SerialName("succeeded")
    SUCCEEDED("succeeded"),

    @SerialName("failed")
    FAILED("failed"),

    @SerialName("cancelled")
    CANCELLED("cancelled"),

    @SerialName("interrupted")
    INTERRUPTED("interrupted"),

    @SerialName("gracefully_stopped")
    GRACEFULLY_STOPPED("gracefully_stopped"),
}

@Serializable
data class MessageUser(
    val fullName: String? = null,
    val image: String? = null,
)

@Serializable
data class UserMessageContext(
    val username: String? = null,
    val fullName: String? = null,
    val email: String? = null,
    val profilePictureUrl: String? = null,
    val selectedMCPServerViewIds: List<String>? = null,
)

@Serializable
data class ContentFragment(
    val id: Int,
    val sId: String,
    val created: Double,
    val title: String,
    val contentType: String,
    val fileId: String? = null,
    val snippet: String? = null,
    val sourceUrl: String? = null,
) {
    val isImage: Boolean
        get() = contentType.startsWith("image/")
}

@Serializable
data class UserMessage(
    val id: Int,
    val sId: String,
    val type: MessageType,
    val created: Double,
    val visibility: String,
    val version: Int,
    val rank: Int,
    val content: String,
    val user: MessageUser? = null,
    val context: UserMessageContext? = null,
    val contentFragments: List<ContentFragment>? = null,
) {
    val isPending: Boolean
        get() = visibility == "pending"

    val authorAvatarUrl: String?
        get() = user?.image ?: context?.profilePictureUrl

    val authorName: String?
        get() = user?.fullName ?: context?.fullName ?: context?.username
}

@Serializable
data class GeneratedFile(
    val fileId: String? = null,
    val filePath: String? = null,
    val title: String,
    val contentType: String,
    val createdAt: Double? = null,
    val updatedAt: Double? = null,
    val hidden: Boolean? = null,
) {
    val isVisible: Boolean
        get() = hidden != true
}

@Serializable
data class CitationReference(
    val title: String,
    val provider: String,
    val contentType: String,
    val description: String? = null,
    val href: String? = null,
)

@Serializable
data class AgentConfiguration(
    val sId: String,
    val name: String,
    val pictureUrl: String? = null,
)

@Serializable
data class AgentMessage(
    val sId: String,
    val type: MessageType,
    val created: Double,
    val visibility: String,
    val version: Int,
    val rank: Int,
    val status: AgentMessageStatus,
    val content: String? = null,
    val chainOfThought: String? = null,
    val configuration: AgentConfiguration,
    val generatedFiles: List<GeneratedFile>? = null,
    val citations: Map<String, CitationReference>? = null,
    val error: StreamingError? = null,
) {
    val isStreaming: Boolean
        get() = status == AgentMessageStatus.CREATED
}
