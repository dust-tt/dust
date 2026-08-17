package com.dust.mobile.android.ui.preview

import com.dust.mobile.core.model.Capability
import com.dust.mobile.core.model.DEFAULT_AGENT_CONFIGURATION_ID
import com.dust.mobile.core.model.KnowledgeItem
import com.dust.mobile.core.model.LightAgentConfiguration
import com.dust.mobile.core.model.MCPServer
import com.dust.mobile.core.model.MCPServerView
import com.dust.mobile.core.model.Skill

internal fun localPreviewAgents(): List<LightAgentConfiguration> =
    listOf(
        LightAgentConfiguration(
            sId = DEFAULT_AGENT_CONFIGURATION_ID,
            name = "Dust",
            description = "General purpose workspace agent",
            pictureUrl = DUST_AGENT_AVATAR_URL,
            scope = "global",
            userFavorite = true,
        ),
        LightAgentConfiguration(
            sId = "local-agent-sales",
            name = "Sales Team",
            description = "Prepares account notes and customer-ready summaries",
            pictureUrl = SALES_AGENT_AVATAR_URL,
            scope = "global",
        ),
        LightAgentConfiguration(
            sId = "local-agent-launch",
            name = "Launch Team",
            description = "Coordinates customer launch follow-ups and owners",
            pictureUrl = LAUNCH_AGENT_AVATAR_URL,
            scope = "global",
        ),
        LightAgentConfiguration(
            sId = "local-agent-memory",
            name = "Memory",
            description = "Summarizes workspace history and recent decisions",
            pictureUrl = MEMORY_AGENT_AVATAR_URL,
            scope = "global",
        ),
    )

internal fun localPreviewCapabilities(workspaceId: String): List<Capability> =
    listOf(
        Capability.Tool(
            MCPServerView(
                sId = "local-tool-notion-$workspaceId",
                name = "Notion",
                description = "Search docs and project notes",
                spaceId = "local-global-space",
                server = MCPServer(
                    sId = "local-server-notion",
                    name = "Notion",
                    description = "Search docs and project notes",
                ),
            ),
        ),
        Capability.Tool(
            MCPServerView(
                sId = "local-tool-slack-$workspaceId",
                name = "Slack",
                description = "Read relevant workspace threads",
                spaceId = "local-global-space",
                server = MCPServer(
                    sId = "local-server-slack",
                    name = "Slack",
                    description = "Read relevant workspace threads",
                ),
            ),
        ),
        Capability.SkillCapability(
            Skill(
                sId = "local-skill-briefing",
                name = "Customer briefing",
                userFacingDescription = "Create a concise account brief from recent updates.",
            ),
        ),
        Capability.SkillCapability(
            Skill(
                sId = "local-skill-follow-up",
                name = "Meeting follow-up",
                userFacingDescription = "Turn meeting notes into decisions, owners, and next steps.",
            ),
        ),
        Capability.SkillCapability(
            Skill(
                sId = "local-skill-digest",
                name = "Workspace digest",
                userFacingDescription = "Summarize the latest workspace activity and open questions.",
            ),
        ),
    ).sortedBy { it.sortKey }

internal fun localPreviewKnowledgeItems(query: String): List<KnowledgeItem> =
    listOf(
        KnowledgeItem(
            title = "Q3 account plan",
            internalId = "local-q3-account-plan",
            dataSourceViewId = "local-dsv-notion",
            connectorProvider = "notion",
            nodeType = "document",
        ),
        KnowledgeItem(
            title = "Renewal meeting notes",
            internalId = "local-renewal-notes",
            dataSourceViewId = "local-dsv-drive",
            connectorProvider = "google_drive",
            nodeType = "document",
        ),
        KnowledgeItem(
            title = "Launch stakeholder thread",
            internalId = "local-launch-thread",
            dataSourceViewId = "local-dsv-slack",
            connectorProvider = "slack",
            nodeType = "thread",
        ),
    ).filter { item ->
        item.title.contains(query, ignoreCase = true) ||
            item.connectorProvider?.contains(query, ignoreCase = true) == true
    }.ifEmpty {
        listOf(
            KnowledgeItem(
                title = "Suggested source for \"$query\"",
                internalId = "local-result-${query.hashCode()}",
                dataSourceViewId = "local-dsv-preview",
                connectorProvider = "local",
                nodeType = "document",
            ),
        )
    }
