package com.dust.mobile.android.shortcuts

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import androidx.core.app.Person
import androidx.core.content.LocusIdCompat
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import com.dust.mobile.android.MainActivity
import com.dust.mobile.android.R
import com.dust.mobile.android.data.persistence.PersistedAgentTarget
import com.dust.mobile.android.data.persistence.PersistedStateStore
import com.dust.mobile.android.share.DIRECT_SHARE_CATEGORY
import com.dust.mobile.android.share.EXTRA_TARGET_AGENT_ID
import com.dust.mobile.android.share.EXTRA_TARGET_SHORTCUT_ID
import com.dust.mobile.android.share.EXTRA_TARGET_WORKSPACE_ID
import com.dust.mobile.core.model.LightAgentConfiguration

internal class AgentShortcutPublisher(
    private val context: Context,
    private val stateStore: PersistedStateStore,
) {
    suspend fun publish(workspaceId: String, agents: List<LightAgentConfiguration>) {
        val retainedShortcuts = ShortcutManagerCompat.getDynamicShortcuts(context)
            .filterNot { it.id.startsWith(SHORTCUT_ID_PREFIX) }
        val maxTargets = (
            ShortcutManagerCompat.getMaxShortcutCountPerActivity(context) -
                STATIC_SHORTCUT_COUNT - retainedShortcuts.size
            )
            .coerceIn(0, MAX_SHARE_TARGETS)
        val targets = rankedShareAgents(
            workspaceId = workspaceId,
            agents = agents,
            recentTargets = stateStore.current().recentAgents,
            limit = maxTargets,
        )
        ShortcutManagerCompat.setDynamicShortcuts(
            context,
            retainedShortcuts + targets.mapIndexed { rank, agent -> agent.toShortcut(workspaceId, rank) },
        )
    }

    suspend fun recordAgent(
        workspaceId: String,
        agent: LightAgentConfiguration,
        availableAgents: List<LightAgentConfiguration>,
        shortcutId: String? = null,
    ) {
        val now = System.currentTimeMillis()
        stateStore.update { state ->
            val target = PersistedAgentTarget(
                workspaceId = workspaceId,
                agentId = agent.sId,
                name = agent.name,
                pictureUrl = agent.pictureUrl,
                lastUsedAtEpochMillis = now,
            )
            state.copy(
                recentAgents = (listOf(target) + state.recentAgents.filterNot {
                    it.workspaceId == workspaceId && it.agentId == agent.sId
                }).take(MAX_RECENT_TARGETS),
            )
        }
        shortcutId?.let { ShortcutManagerCompat.reportShortcutUsed(context, it) }
        publish(workspaceId, availableAgents)
    }

    fun clear() {
        runCatching {
            val flags = ShortcutManagerCompat.FLAG_MATCH_DYNAMIC or ShortcutManagerCompat.FLAG_MATCH_CACHED
            val ids = ShortcutManagerCompat.getShortcuts(context, flags)
                .map(ShortcutInfoCompat::getId)
                .filter { it.startsWith(SHORTCUT_ID_PREFIX) }
            ShortcutManagerCompat.removeDynamicShortcuts(context, ids)
            ShortcutManagerCompat.removeLongLivedShortcuts(context, ids)
        }
    }

    private fun LightAgentConfiguration.toShortcut(workspaceId: String, rank: Int): ShortcutInfoCompat {
        val id = shortcutId(workspaceId, sId)
        val icon = IconCompat.createWithResource(context, R.drawable.ic_agent_shortcut)
        val person = Person.Builder()
            .setKey(id)
            .setName(name)
            .setIcon(icon)
            .setBot(true)
            .setImportant(userFavorite)
            .build()
        val intent = Intent(Intent.ACTION_SEND)
            .setClass(context, MainActivity::class.java)
            .putExtra(EXTRA_TARGET_WORKSPACE_ID, workspaceId)
            .putExtra(EXTRA_TARGET_AGENT_ID, sId)
            .putExtra(EXTRA_TARGET_SHORTCUT_ID, id)
        return ShortcutInfoCompat.Builder(context, id)
            .setShortLabel(name)
            .setLongLabel(context.getString(R.string.share_with_agent, name))
            .setIcon(icon)
            .setIntent(intent)
            .setActivity(ComponentName(context, MainActivity::class.java))
            .setCategories(setOf(DIRECT_SHARE_CATEGORY))
            .setPerson(person)
            .setLocusId(LocusIdCompat(id))
            .setIsConversation()
            .setLongLived(true)
            .setRank(rank)
            .build()
    }

    private companion object {
        const val SHORTCUT_ID_PREFIX = "agent:"
        const val STATIC_SHORTCUT_COUNT = 2
        const val MAX_SHARE_TARGETS = 3
        const val MAX_RECENT_TARGETS = 8

        fun shortcutId(workspaceId: String, agentId: String): String =
            "$SHORTCUT_ID_PREFIX$workspaceId:$agentId"
    }
}
