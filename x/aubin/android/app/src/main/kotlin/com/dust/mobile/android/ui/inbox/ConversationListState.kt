package com.dust.mobile.android.ui.inbox

import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.ConversationListData
import com.dust.mobile.core.model.DustUser
import com.dust.mobile.core.model.Space
import com.dust.mobile.core.model.Workspace
import com.dust.mobile.core.model.filteredByTitleSearch

data class ConversationListState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val actionError: String? = null,
    val dustUser: DustUser? = null,
    val workspace: Workspace? = null,
    val workspaces: List<Workspace> = emptyList(),
    val conversations: List<Conversation> = emptyList(),
    val pods: List<Space> = emptyList(),
    val isPodsExpanded: Boolean = false,
    val searchText: String = "",
    val systemSearchEnabled: Boolean = false,
    val isRefreshing: Boolean = false,
    val hasMore: Boolean = false,
    val lastValue: String? = null,
    val hasLoadedMore: Boolean = false,
    val isLoadingMore: Boolean = false,
    val loadMoreError: String? = null,
    val search: ConversationSearchState = ConversationSearchState(),
) {
    val bodyState: ConversationListBodyState
        get() = when {
            isLoading && conversations.isEmpty() && pods.isEmpty() -> ConversationListBodyState.LOADING
            error != null && conversations.isEmpty() && pods.isEmpty() -> ConversationListBodyState.ERROR
            else -> ConversationListBodyState.CONTENT
        }

    val refreshError: String?
        get() = error.takeIf { bodyState == ConversationListBodyState.CONTENT }

    val unreadConversations: List<Conversation>
        get() = conversations.filter { it.unread || it.actionRequired }

    val groupedConversations: List<ConversationGroup>
        get() {
            if (searchText.isNotBlank()) {
                val matches = search.results ?: conversations.filteredByTitleSearch(searchText.trim())
                return if (matches.isEmpty()) emptyList() else listOf(ConversationGroup("Search results", matches))
            }
            val filtered = conversations.filteredByTitleSearch(searchText)
            val focus = filtered.filter { it.unread || it.actionRequired || it.hasError }
            val focusIds = focus.map { it.sId }.toSet()
            val recent = filtered.filterNot { it.sId in focusIds }
            return buildList {
                if (focus.isNotEmpty()) add(ConversationGroup("Needs you", focus))
                if (recent.isNotEmpty()) add(ConversationGroup("Recent", recent))
            }
        }
}

enum class ConversationListBodyState {
    LOADING,
    ERROR,
    CONTENT,
}

internal fun ConversationListState.withRefreshDataForWorkspace(
    workspaceId: String,
    data: ConversationListData,
): ConversationListState {
    if (workspace?.sId != workspaceId) return this
    val oldestRefreshedMs = data.conversations.minOfOrNull { it.effectiveEpochMs }
    val older = if (hasLoadedMore && data.hasMore && oldestRefreshedMs != null) {
        conversations.filter { it.effectiveEpochMs < oldestRefreshedMs }
    } else {
        emptyList()
    }
    return copy(
        isLoading = false,
        isRefreshing = false,
        error = null,
        conversations = (data.conversations + older).distinctBy { it.sId },
        pods = data.pods,
        hasMore = if (older.isEmpty()) data.hasMore else hasMore,
        lastValue = if (older.isEmpty()) data.lastValue else lastValue,
        hasLoadedMore = older.isNotEmpty(),
        isLoadingMore = false,
        loadMoreError = null,
    )
}

internal fun ConversationListState.withRefreshErrorForWorkspace(
    workspaceId: String,
    error: String,
): ConversationListState =
    if (workspace?.sId == workspaceId) {
        copy(isLoading = false, isRefreshing = false, error = error)
    } else {
        this
    }

internal fun ConversationListState.refreshStarted(): ConversationListState =
    copy(
        isRefreshing = !isLoading,
        error = null,
    )

internal fun ConversationListState.withRefreshStoppedForWorkspace(
    workspaceId: String,
): ConversationListState =
    if (workspace?.sId == workspaceId) copy(isRefreshing = false) else this

internal fun ConversationListState.withWorkspaceSelection(
    workspace: Workspace,
    data: ConversationListData?,
): ConversationListState =
    copy(
        workspace = workspace,
        conversations = data?.conversations.orEmpty(),
        pods = data?.pods.orEmpty(),
        actionError = null,
        searchText = "",
        search = ConversationSearchState(),
        hasMore = data?.hasMore ?: false,
        lastValue = data?.lastValue,
        hasLoadedMore = false,
        isLoadingMore = false,
        loadMoreError = null,
        isLoading = data == null,
        isRefreshing = false,
        error = null,
    )

internal fun ConversationListState.withWorkspaceData(
    dustUser: DustUser,
    workspace: Workspace,
    data: ConversationListData?,
    systemSearchEnabled: Boolean,
): ConversationListState =
    copy(
        isLoading = data == null,
        isRefreshing = false,
        error = null,
        dustUser = dustUser,
        workspace = workspace,
        workspaces = dustUser.workspaces,
        conversations = data?.conversations.orEmpty(),
        pods = data?.pods.orEmpty(),
        systemSearchEnabled = systemSearchEnabled,
        actionError = null,
        searchText = "",
        search = ConversationSearchState(),
        hasMore = data?.hasMore ?: false,
        lastValue = data?.lastValue,
        hasLoadedMore = false,
        isLoadingMore = false,
        loadMoreError = null,
    )

data class ConversationSearchState(
    val retryLoadMore: Boolean = false,
    val results: List<Conversation>? = null,
    val isLoading: Boolean = false,
    val hasMore: Boolean = false,
    val lastValue: String? = null,
    val error: String? = null,
)
