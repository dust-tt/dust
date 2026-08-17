package com.dust.mobile.android.ui.inbox.pod

import com.dust.mobile.android.ui.inbox.ConversationGroup
import com.dust.mobile.android.ui.inbox.groupByDate
import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.PodDetails
import com.dust.mobile.core.model.PodFileEntry
import com.dust.mobile.core.model.PodNotificationPreference
import com.dust.mobile.core.model.PodTask
import com.dust.mobile.core.model.PodTaskFilter
import com.dust.mobile.core.model.filteredByTitleSearch
import com.dust.mobile.core.model.podFileChildren

internal enum class PodTab {
    CONVERSATIONS,
    TASKS,
    FILES,
    SETTINGS,
}

internal data class PodState(
    val selectedTab: PodTab = PodTab.CONVERSATIONS,
    val details: PodDetails? = null,
    val isDetailsLoading: Boolean = true,
    val detailsError: String? = null,
    val conversations: List<Conversation> = emptyList(),
    val isConversationsLoading: Boolean = true,
    val conversationsError: String? = null,
    val conversationSearch: String = "",
    val files: List<PodFileEntry> = emptyList(),
    val isFilesLoading: Boolean = true,
    val filesError: String? = null,
    val currentFolderPath: String = "",
    val pinnedFrameCode: String? = null,
    val pinnedFrameFileId: String? = null,
    val isPinnedFrameLoading: Boolean = false,
    val pinnedFrameError: String? = null,
    val taskFilter: PodTaskFilter = PodTaskFilter.OPEN,
    val tasks: List<PodTask> = emptyList(),
    val hasLoadedTasks: Boolean = false,
    val isTasksLoading: Boolean = false,
    val tasksError: String? = null,
    val taskDraft: String = "",
    val isTaskSaving: Boolean = false,
    val notificationPreference: PodNotificationPreference? = null,
    val isNotificationLoading: Boolean = true,
    val notificationError: String? = null,
    val isNotificationSaving: Boolean = false,
    val isTaskSuggestionsSaving: Boolean = false,
    val isPinUpdating: Boolean = false,
    val actionError: String? = null,
) {
    val groupedConversations: List<ConversationGroup>
        get() = groupByDate(conversations.filteredByTitleSearch(conversationSearch))

    val pinnedFrame: PodFileEntry?
        get() = details?.pinnedFramePath?.let { path -> files.find { it.path == path && it.isFrame } }

    fun visibleFiles(podId: String): List<PodFileEntry> =
        podFileChildren(files, podId, currentFolderPath)
}
