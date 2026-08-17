package com.dust.mobile.android.ui.composer

import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.android.ui.preview.localPreviewKnowledgeItems
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.model.KnowledgeItem
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

internal class KnowledgeSearchController(
    private val graph: AppGraph,
    private val tokenProvider: TokenProvider,
    private val workspaceId: String,
    private val isLocalPreview: Boolean,
    private val coroutineScope: CoroutineScope,
) {
    private var searchJob: Job? = null
    private var activeQuery = ""

    fun search(
        query: String,
        onSearchingChanged: (Boolean) -> Unit,
        onResults: (List<KnowledgeItem>) -> Unit,
        onError: (String) -> Unit,
    ) {
        activeQuery = query
        searchJob?.cancel()
        if (query.length < MINIMUM_KNOWLEDGE_QUERY_LENGTH) {
            onResults(emptyList())
            onSearchingChanged(false)
            return
        }
        if (isLocalPreview) {
            onResults(localPreviewKnowledgeItems(query))
            onSearchingChanged(false)
            return
        }

        searchJob = coroutineScope.launch {
            onSearchingChanged(true)
            delay(KNOWLEDGE_CONTROLLER_DEBOUNCE_MS)
            try {
                val results = graph.capabilityRepository.searchKnowledge(
                    workspaceId,
                    query,
                    tokenProvider,
                ).nodes.mapNotNull { it.toKnowledgeItem() }
                if (query == activeQuery) {
                    onResults(results)
                    onSearchingChanged(false)
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                if (query == activeQuery) {
                    onSearchingChanged(false)
                    onError(error.message ?: "Knowledge search failed")
                }
            }
        }
    }

    fun cancel() {
        activeQuery = ""
        searchJob?.cancel()
        searchJob = null
    }
}

private const val MINIMUM_KNOWLEDGE_QUERY_LENGTH = 2
private const val KNOWLEDGE_CONTROLLER_DEBOUNCE_MS = 300L
