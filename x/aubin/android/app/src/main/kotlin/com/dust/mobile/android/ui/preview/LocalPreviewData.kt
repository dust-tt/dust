package com.dust.mobile.android.ui.preview

import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.ConversationListData
import com.dust.mobile.core.model.DustUser
import com.dust.mobile.core.model.Space
import com.dust.mobile.core.model.User
import com.dust.mobile.core.model.Workspace

internal fun localPreviewUser(): User =
    User(
        id = "local-preview-user",
        email = "lea.martin@dust.tt",
        emailVerified = true,
        firstName = "Lea",
        lastName = "Martin",
    )

internal fun localPreviewDustUser(): DustUser =
    DustUser(
        sId = "local-preview-user",
        firstName = "Lea",
        lastName = "Martin",
        workspaces = localPreviewWorkspaces(),
        selectedWorkspace = "local-workspace",
    )

internal fun localPreviewWorkspaces(): List<Workspace> =
    listOf(
        Workspace(sId = "local-workspace", name = "Revenue Team", role = "admin"),
        Workspace(sId = "local-mobile", name = "Launch Team", role = "builder"),
    )

internal fun localPreviewConversationListData(workspaceId: String): ConversationListData =
    ConversationListData(
        conversations = localPreviewConversations(workspaceId),
        pods = localPreviewPods(),
    )

internal fun localPreviewPods(): List<Space> =
    listOf(
        Space(
            sId = "local-pod-customers",
            name = "Customer Ops",
            kind = "project",
            description = "Customer-facing follow-ups and account preparation",
        ),
        Space(
            sId = "local-pod-mobile",
            name = "Launch Planning",
            kind = "project",
            description = "Customer launch tasks, stakeholder updates, and follow-ups",
            isRestricted = true,
        ),
    )

internal fun localPreviewConversations(workspaceId: String): List<Conversation> {
    if (workspaceId == "local-mobile") {
        return listOf(
            localPreviewConversation(
                sId = "local-briefing-mobile",
                minutesAgo = 12,
                title = "Finalize launch readiness",
                unread = true,
                actionRequired = true,
                spaceId = "local-pod-mobile",
            ),
            localPreviewConversation(
                sId = "local-launch-mobile",
                minutesAgo = 58,
                title = "Align stakeholder follow-ups",
                unread = true,
                spaceId = "local-pod-mobile",
            ),
            localPreviewConversation(
                sId = "local-weekly-mobile",
                minutesAgo = 1_440,
                title = "Summarize launch changes",
                spaceId = "local-pod-mobile",
            ),
        )
    }

    return listOf(
        localPreviewConversation(
            sId = "local-briefing",
            minutesAgo = 18,
            title = "Prepare the Q3 customer briefing",
            unread = true,
            actionRequired = true,
            spaceId = "local-pod-customers",
        ),
        localPreviewConversation(
            sId = "local-launch",
            minutesAgo = 74,
            title = "Coordinate launch follow-ups",
            unread = true,
            spaceId = "local-pod-mobile",
        ),
        localPreviewConversation(
            sId = "local-account-review",
            minutesAgo = 2,
            title = "Draft the account review",
            spaceId = "local-pod-customers",
            isRunningAgentLoop = true,
        ),
        localPreviewConversation(
            sId = "local-weekly",
            minutesAgo = 18,
            title = "Summarize workspace changes",
            nextWakeupAt = (System.currentTimeMillis() + 24 * 60 * 60_000).toDouble(),
        ),
        localPreviewConversation(
            sId = "local-research",
            minutesAgo = 1_610,
            title = "Research onboarding examples",
            triggerId = "local-trigger",
        ),
    )
}

internal fun localPreviewPodConversations(workspaceId: String, spaceId: String): List<Conversation> {
    val source = localPreviewConversations(workspaceId)
    return if (spaceId == "local-pod-mobile") {
        source.filter { it.sId.contains("launch") || it.sId.contains("weekly") }
    } else {
        source.filter { it.sId.contains("briefing") || it.sId.contains("weekly") }
    }
}

internal fun localPreviewConversation(
    sId: String,
    minutesAgo: Long,
    title: String,
    unread: Boolean = false,
    actionRequired: Boolean = false,
    spaceId: String? = null,
    isRunningAgentLoop: Boolean = false,
    nextWakeupAt: Double? = null,
    triggerId: String? = null,
): Conversation {
    val updatedAtMs = System.currentTimeMillis() - minutesAgo * 60_000
    return Conversation(
        sId = sId,
        created = (updatedAtMs - 20 * 60_000).toDouble(),
        updated = updatedAtMs.toDouble(),
        title = title,
        unread = unread,
        actionRequired = actionRequired,
        spaceId = spaceId,
        isRunningAgentLoop = isRunningAgentLoop,
        nextWakeupAt = nextWakeupAt,
        triggerId = triggerId,
    )
}

internal const val DUST_AGENT_AVATAR_URL = "https://dust.tt/static/systemavatar/dust_avatar_full.png"
internal const val SALES_AGENT_AVATAR_URL = "https://dust.tt/static/droidavatar/Droid_Lime_1.jpg"
internal const val LAUNCH_AGENT_AVATAR_URL = "https://dust.tt/static/droidavatar/Droid_Pink_3.jpg"
internal const val MEMORY_AGENT_AVATAR_URL = "https://dust.tt/static/droidavatar/Droid_Yellow_2.jpg"
