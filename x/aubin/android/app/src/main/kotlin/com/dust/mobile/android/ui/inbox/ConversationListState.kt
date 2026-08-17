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
    val dustUser: DustUser? = null,
    val workspace: Workspace? = null,
    val workspaces: List<Workspace> = emptyList(),
    val conversations: List<Conversation> = emptyList(),
    val pods: List<Space> = emptyList(),
    val isPodsExpanded: Boolean = false,
    val searchText: String = "",
    val systemSearchEnabled: Boolean = false,
    val isRefreshing: Boolean = false,
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
): ConversationListState =
    if (workspace?.sId == workspaceId) {
        copy(
            isLoading = false,
            isRefreshing = false,
            error = null,
            conversations = data.conversations,
            pods = data.pods,
        )
    } else {
        this
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
        searchText = "",
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
    )
