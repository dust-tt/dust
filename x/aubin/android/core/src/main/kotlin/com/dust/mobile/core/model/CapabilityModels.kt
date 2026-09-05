package com.dust.mobile.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

sealed interface Capability {
    val id: String
    val displayName: String
    val displayDescription: String
    val sortKey: String
        get() = displayName.lowercase()

    data class Tool(val serverView: MCPServerView) : Capability {
        override val id: String = "tool:${serverView.sId}"
        override val displayName: String = serverView.displayName
        override val displayDescription: String = serverView.displayDescription
    }

    data class SkillCapability(val skill: Skill) : Capability {
        override val id: String = "skill:${skill.sId}"
        override val displayName: String = skill.name
        override val displayDescription: String = skill.displayDescription
    }
}

@Serializable
data class MCPServer(
    val sId: String,
    val name: String,
    val description: String,
    val icon: String? = null,
)

@Serializable
data class MCPServerView(
    val sId: String,
    val name: String? = null,
    val description: String? = null,
    val spaceId: String,
    val server: MCPServer,
) {
    val displayName: String
        get() = name ?: server.name

    val displayDescription: String
        get() = description ?: server.description
}

@Serializable
data class MCPServerViewsResponse(
    val serverViews: List<MCPServerView>,
)

@Serializable
data class Skill(
    val sId: String,
    val name: String,
    val userFacingDescription: String? = null,
    val icon: String? = null,
) {
    val displayDescription: String
        get() = userFacingDescription.orEmpty()
}

@Serializable
data class SkillsResponse(
    val skills: List<Skill>,
)

@Serializable
data class SearchNode(
    val internalId: String,
    val title: String,
    val sourceUrl: String? = null,
    val mimeType: String? = null,
    val type: String? = null,
    val parentTitle: String? = null,
    val dataSource: SearchDataSource? = null,
    val dataSourceViews: List<SearchDataSourceView>? = null,
) {
    fun toKnowledgeItem(): KnowledgeItem? {
        val dataSourceViewId = dataSourceViews?.firstOrNull()?.sId ?: return null
        return KnowledgeItem(
            title = title,
            internalId = internalId,
            dataSourceViewId = dataSourceViewId,
            sourceUrl = sourceUrl,
            connectorProvider = dataSource?.connectorProvider,
            nodeType = type,
        )
    }
}

@Serializable
data class SearchDataSource(
    val name: String? = null,
    val sId: String? = null,
    val connectorProvider: String? = null,
)

@Serializable
data class SearchDataSourceView(
    val sId: String,
    val spaceId: String? = null,
)

@Serializable
enum class SearchViewType {
    @SerialName("table")
    TABLE,

    @SerialName("document")
    DOCUMENT,

    @SerialName("all")
    ALL,
}

@Serializable
data class SearchRequest(
    val query: String,
    val viewType: SearchViewType = SearchViewType.ALL,
    val includeDataSources: Boolean = false,
    val limit: Int = 25,
)

@Serializable
data class SearchResponse(
    val nodes: List<SearchNode>,
    val nextPageCursor: String? = null,
    val resultsCount: Int? = null,
)

@Serializable
data class KnowledgeItem(
    val title: String,
    val internalId: String,
    val dataSourceViewId: String,
    val sourceUrl: String? = null,
    val connectorProvider: String? = null,
    val nodeType: String? = null,
) {
    val id: String
        get() = "$dataSourceViewId:$internalId"
}

fun selectableKnowledgeItems(results: List<KnowledgeItem>, selected: List<KnowledgeItem>): List<KnowledgeItem> {
    val selectedIds = selected.map { it.id }.toSet()
    return results.filterNot { it.id in selectedIds }
}

fun filterSelectableCapabilities(
    capabilities: List<Capability>,
    selected: List<Capability>,
    query: String,
    limit: Int? = null,
): List<Capability> {
    val selectedIds = selected.map { it.id }.toSet()
    val normalizedQuery = query.lowercase()
    val filtered = capabilities
        .filterNot { it.id in selectedIds }
        .filter { capability ->
            query.isEmpty() ||
                capability.displayName.lowercase().contains(normalizedQuery) ||
                capability.displayDescription.lowercase().contains(normalizedQuery)
        }

    return limit?.let(filtered::take) ?: filtered
}

@Serializable
data class Space(
    val sId: String,
    val name: String,
    val kind: String,
    val description: String? = null,
    val isRestricted: Boolean = false,
)

@Serializable
data class SpaceSummaryEntry(
    val space: Space,
)

@Serializable
data class SpaceSummaryResponse(
    val summary: List<SpaceSummaryEntry>,
)

@Serializable
data class SpacesResponse(
    val spaces: List<Space>,
)
