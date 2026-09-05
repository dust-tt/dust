package com.dust.mobile.android.ui.inbox

import com.dust.mobile.core.model.ConversationsResponse
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

internal class ConversationDiscoveryController(
    private val state: MutableStateFlow<ConversationListState>,
    private val scope: CoroutineScope,
    private val fetchPage: suspend (String, String) -> ConversationsResponse,
    private val searchConversations: suspend (String, String, String?) -> ConversationsResponse,
) {
    private var searchJob: Job? = null
    private var pageJob: Job? = null

    fun updateSearch(text: String) {
        val query = text.trim()
        val previousQuery = state.value.searchText.trim()
        state.update { it.copy(searchText = text) }
        if (query == previousQuery) return
        searchJob?.cancel()
        state.update { it.copy(search = ConversationSearchState(isLoading = query.isNotEmpty())) }
        if (query.isNotEmpty()) search(loadMore = false, debounceMs = SEARCH_DEBOUNCE_MS)
    }

    fun retrySearch() = search(loadMore = false)

    fun loadMore() {
        if (state.value.searchText.isNotBlank()) {
            search(loadMore = true)
            return
        }
        val current = state.value
        val workspaceId = current.workspace?.sId ?: return
        val cursor = current.lastValue ?: return
        if (!current.hasMore || current.isLoadingMore || current.isRefreshing) return
        pageJob?.cancel()
        state.update { it.copy(isLoadingMore = true, loadMoreError = null) }
        pageJob = scope.launch {
            try {
                val page = fetchPage(workspaceId, cursor)
                currentCoroutineContext().ensureActive()
                state.update {
                    if (it.workspace?.sId != workspaceId || it.lastValue != cursor) it else it.copy(
                        conversations = (it.conversations + page.conversations).distinctBy { item -> item.sId },
                        hasMore = page.hasMore && page.lastValue != null && page.lastValue != cursor,
                        lastValue = page.lastValue,
                        hasLoadedMore = true,
                        isLoadingMore = false,
                    )
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                currentCoroutineContext().ensureActive()
                state.update {
                    if (it.workspace?.sId != workspaceId || it.lastValue != cursor) it else it.copy(
                        isLoadingMore = false,
                        loadMoreError = "Couldn't load older conversations. Try again.",
                    )
                }
            }
        }
    }

    fun cancel() {
        searchJob?.cancel()
        pageJob?.cancel()
    }

    private fun search(loadMore: Boolean, debounceMs: Long = 0L) {
        val current = state.value
        val workspaceId = current.workspace?.sId ?: return
        val query = current.searchText.trim().takeIf { it.isNotEmpty() } ?: return
        val cursor = if (loadMore) current.search.lastValue else null
        if (loadMore && (!current.search.hasMore || current.search.isLoading || cursor == null)) return
        searchJob?.cancel()
        state.update { it.copy(search = it.search.copy(isLoading = true, error = null)) }
        searchJob = scope.launch {
            try {
                delay(debounceMs)
                val page = searchConversations(workspaceId, query, cursor)
                currentCoroutineContext().ensureActive()
                state.update {
                    if (it.workspace?.sId != workspaceId || it.searchText.trim() != query) it else it.copy(
                        search = ConversationSearchState(
                            results = ((if (loadMore) it.search.results.orEmpty() else emptyList()) + page.conversations)
                                .distinctBy { item -> item.sId },
                            hasMore = page.hasMore && page.lastValue != null && page.lastValue != cursor,
                            lastValue = page.lastValue,
                        ),
                    )
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                currentCoroutineContext().ensureActive()
                state.update {
                    if (it.workspace?.sId != workspaceId || it.searchText.trim() != query) it else it.copy(
                        search = it.search.copy(
                            isLoading = false,
                            retryLoadMore = loadMore,
                            error = if (it.search.results == null) {
                                "Couldn't load conversations. Showing matches from saved conversations."
                            } else if (loadMore) {
                                "Couldn't load more matches. Try again."
                            } else {
                                "Couldn't refresh results. Try again."
                            },
                        ),
                    )
                }
            }
        }
    }
}

private const val SEARCH_DEBOUNCE_MS = 250L
