package com.dust.mobile.android.notifications

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import androidx.core.app.Person
import androidx.core.content.LocusIdCompat
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import androidx.core.net.toUri
import com.dust.mobile.android.MainActivity
import com.dust.mobile.android.R

internal class ConversationNotificationShortcutPublisher(
    private val context: Context,
) {
    fun publish(payload: DustNotificationPayload): String? {
        if (!payload.usesHumanConversationSemantics) return null
        val id = shortcutId(payload.workspaceId, payload.conversationId)
        val icon = IconCompat.createWithResource(context, R.drawable.ic_person_24)
        val person = Person.Builder()
            .setKey(requireNotNull(payload.authorUserId))
            .setName(payload.authorName ?: "Dust user")
            .setIcon(icon)
            .setImportant(payload.isMention)
            .setBot(false)
            .build()
        val intent = Intent(
            Intent.ACTION_VIEW,
            payload.deepLink(CALLBACK_SCHEME).toUri(),
            context,
            MainActivity::class.java,
        )
        val shortcut = ShortcutInfoCompat.Builder(context, id)
            .setShortLabel(payload.conversationTitle)
            .setLongLabel(payload.conversationTitle)
            .setIcon(icon)
            .setIntent(intent)
            .setActivity(ComponentName(context, MainActivity::class.java))
            .setPerson(person)
            .setLocusId(LocusIdCompat(id))
            .setIsConversation()
            .setLongLived(true)
            .setRank(0)
            .build()
        return id.takeIf { ShortcutManagerCompat.pushDynamicShortcut(context, shortcut) }
    }

    fun clear() {
        val flags = ShortcutManagerCompat.FLAG_MATCH_DYNAMIC or ShortcutManagerCompat.FLAG_MATCH_CACHED
        val ids = ShortcutManagerCompat.getShortcuts(context, flags)
            .map(ShortcutInfoCompat::getId)
            .filter { it.startsWith(SHORTCUT_ID_PREFIX) }
        ShortcutManagerCompat.removeDynamicShortcuts(context, ids)
        ShortcutManagerCompat.removeLongLivedShortcuts(context, ids)
    }

    private companion object {
        const val CALLBACK_SCHEME = "dust"
        const val SHORTCUT_ID_PREFIX = "conversation:"

        fun shortcutId(workspaceId: String, conversationId: String): String =
            "$SHORTCUT_ID_PREFIX$workspaceId:$conversationId"
    }
}
