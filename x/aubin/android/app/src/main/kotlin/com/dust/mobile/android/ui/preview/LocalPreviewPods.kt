package com.dust.mobile.android.ui.preview

import com.dust.mobile.core.model.FRAME_CONTENT_TYPE_PREFIX
import com.dust.mobile.core.model.PodDetails
import com.dust.mobile.core.model.PodFileEntry
import com.dust.mobile.core.model.PodMember
import com.dust.mobile.core.model.PodNotificationCondition
import com.dust.mobile.core.model.PodNotificationPreference
import com.dust.mobile.core.model.PodTask
import com.dust.mobile.core.model.PodTaskAssignee
import com.dust.mobile.core.model.PodTaskFilter
import com.dust.mobile.core.model.PodTaskStatus
import com.dust.mobile.core.model.Space

internal fun localPreviewPodDetails(space: Space): PodDetails =
    PodDetails(
        sId = space.sId,
        name = space.name,
        kind = space.kind,
        description = space.description,
        isRestricted = space.isRestricted,
        canWrite = true,
        canRead = true,
        isMember = true,
        isEditor = space.sId == "local-pod-customers",
        members = listOf(
            PodMember(
                sId = "local-preview-user",
                fullName = "Lea Martin",
                email = "lea.martin@dust.tt",
                isEditor = true,
            ),
            PodMember(
                sId = "local-user-antoine",
                fullName = "Antoine Milkoff",
                email = "antoine@dust.tt",
            ),
            PodMember(
                sId = "local-user-zoe",
                fullName = "Zoe Martin",
                email = "zoe@dust.tt",
            ),
        ),
        pinnedFramePath = if (space.sId == "local-pod-customers") {
            "pod-${space.sId}/Account briefing.frame"
        } else {
            null
        },
    )

internal fun localPreviewPodFiles(podId: String): List<PodFileEntry> =
    listOf(
        PodFileEntry(
            fileName = "Account briefing.frame",
            path = "pod-$podId/Account briefing.frame",
            sizeBytes = 8_420,
            lastModifiedMs = System.currentTimeMillis() - 12 * 60_000,
            isDirectory = false,
            contentType = FRAME_CONTENT_TYPE_PREFIX,
            fileId = "local-file-$podId-frame",
        ),
        PodFileEntry(
            fileName = "Research",
            path = "pod-$podId/Research",
            isDirectory = true,
        ),
        PodFileEntry(
            fileName = "Customer brief.pdf",
            path = "pod-$podId/Customer brief.pdf",
            sizeBytes = 184_000,
            lastModifiedMs = System.currentTimeMillis() - 90 * 60_000,
            isDirectory = false,
            contentType = "application/pdf",
            fileId = "local-file-$podId-pdf",
        ),
        PodFileEntry(
            fileName = "Account health.png",
            path = "pod-$podId/Research/Account health.png",
            sizeBytes = 92_000,
            lastModifiedMs = System.currentTimeMillis() - 3 * 60 * 60_000,
            isDirectory = false,
            contentType = "image/png",
            fileId = "local-file-$podId-image",
        ),
        PodFileEntry(
            fileName = "Review notes.md",
            path = "pod-$podId/Research/Review notes.md",
            sizeBytes = 2_680,
            lastModifiedMs = System.currentTimeMillis() - 5 * 60 * 60_000,
            isDirectory = false,
            contentType = "text/markdown",
            fileId = "local-file-$podId-summary",
        ),
    )

internal fun localPreviewPodTasks(filter: PodTaskFilter): List<PodTask> {
    val lea = PodTaskAssignee(sId = "local-preview-user", fullName = "Lea Martin")
    val antoine = PodTaskAssignee(sId = "local-user-antoine", fullName = "Antoine Milkoff")
    val tasks = listOf(
        PodTask(
            sId = "local-task-briefing",
            user = lea,
            conversationId = "local-briefing",
            text = "Review the Q3 customer briefing",
            status = PodTaskStatus.IN_PROGRESS,
        ),
        PodTask(
            sId = "local-task-risks",
            user = antoine,
            text = "Confirm owners for the open risks",
            status = PodTaskStatus.TODO,
        ),
        PodTask(
            sId = "local-task-sources",
            user = lea,
            text = "Attach the latest account notes",
            status = PodTaskStatus.DONE,
        ),
    )
    return when (filter) {
        PodTaskFilter.OPEN -> tasks.filter { it.status != PodTaskStatus.DONE }
        PodTaskFilter.DONE -> tasks.filter { it.status == PodTaskStatus.DONE }
    }
}

internal fun localPreviewPodNotificationPreference(podId: String) =
    PodNotificationPreference(
        sId = "local-notification-$podId",
        spaceId = podId,
        userId = "local-preview-user",
        preference = PodNotificationCondition.ALL_MESSAGES,
    )
