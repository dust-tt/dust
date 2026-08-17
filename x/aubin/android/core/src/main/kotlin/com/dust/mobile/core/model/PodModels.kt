package com.dust.mobile.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class PodMember(
    val sId: String,
    val fullName: String,
    val image: String? = null,
    val email: String? = null,
    val isEditor: Boolean = false,
)

@Serializable
data class PodDetails(
    val sId: String,
    val name: String,
    val kind: String,
    val description: String? = null,
    val isRestricted: Boolean = false,
    val canWrite: Boolean = false,
    val canRead: Boolean = false,
    val isMember: Boolean = false,
    val members: List<PodMember> = emptyList(),
    val isEditor: Boolean = false,
    val archivedAt: Double? = null,
    val todoGenerationEnabled: Boolean = false,
    val lastTodoAnalysisAt: Double? = null,
    val pinnedFramePath: String? = null,
)

@Serializable
data class PodDetailsResponse(
    val space: PodDetails,
)

@Serializable
data class PodFileEntry(
    val fileName: String,
    val path: String,
    val sizeBytes: Long = 0,
    val lastModifiedMs: Long = 0,
    val isDirectory: Boolean,
    val contentType: String? = null,
    val fileId: String? = null,
    val thumbnailUrl: String? = null,
    val signedDownloadUrl: String? = null,
) {
    val isFrame: Boolean
        get() = !isDirectory && contentType?.startsWith(FRAME_CONTENT_TYPE_PREFIX) == true
}

@Serializable
data class PodFilesResponse(
    val files: List<PodFileEntry>,
)

@Serializable
enum class PodTaskStatus {
    @SerialName("todo")
    TODO,

    @SerialName("in_progress")
    IN_PROGRESS,

    @SerialName("done")
    DONE,
}

@Serializable
data class PodTaskAssignee(
    val sId: String,
    val fullName: String,
    val image: String? = null,
)

@Serializable
data class PodTaskSource(
    val sourceType: String,
    val sourceId: String,
    val sourceTitle: String? = null,
    val sourceUrl: String? = null,
)

@Serializable
data class PodTask(
    val sId: String,
    val user: PodTaskAssignee? = null,
    val conversationId: String? = null,
    val text: String,
    val status: PodTaskStatus,
    val actorRationale: String? = null,
    val sources: List<PodTaskSource> = emptyList(),
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

@Serializable
data class PodTasksResponse(
    val tasks: List<PodTask>,
    val lastReadAt: String? = null,
    val viewerUserId: String? = null,
)

@Serializable
data class PodTaskResponse(
    val task: PodTask,
)

@Serializable
data class CreatePodTaskRequest(
    val text: String,
)

@Serializable
data class UpdatePodTaskRequest(
    val status: PodTaskStatus,
)

@Serializable
enum class PodNotificationCondition {
    @SerialName("all_messages")
    ALL_MESSAGES,

    @SerialName("only_mentions")
    ONLY_MENTIONS,

    @SerialName("never")
    NEVER,
}

@Serializable
data class PodNotificationPreference(
    val sId: String,
    val spaceId: String,
    val userId: String,
    val preference: PodNotificationCondition,
)

@Serializable
data class PodNotificationPreferenceResponse(
    val userProjectNotificationPreference: PodNotificationPreference,
)

@Serializable
data class UpdatePodNotificationPreferenceRequest(
    val preference: PodNotificationCondition,
)

@Serializable
data class UpdatePodMetadataRequest(
    val pinnedFramePath: String?,
)

@Serializable
data class UpdatePodTaskSuggestionsRequest(
    val todoGenerationEnabled: Boolean,
)
