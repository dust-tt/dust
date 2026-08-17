package com.dust.mobile.android.ui.inbox.pod

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.common.DustAvatar
import com.dust.mobile.android.ui.common.DustIconButton
import com.dust.mobile.android.ui.common.DustIconButtonVariant
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.android.ui.theme.contentMuted
import com.dust.mobile.core.model.PodTask
import com.dust.mobile.core.model.PodTaskStatus

@Composable
internal fun PodTaskRow(
    task: PodTask,
    onToggle: () -> Unit,
    onOpenConversation: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 68.dp)
            .then(if (onOpenConversation != null) Modifier.clickable(onClick = onOpenConversation) else Modifier)
            .padding(start = DustSpacing.small, end = DustSpacing.large, top = DustSpacing.small, bottom = DustSpacing.small),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        DustIconButton(
            onClick = onToggle,
            iconRes = if (task.status == PodTaskStatus.DONE) {
                R.drawable.ic_check_box_24
            } else {
                R.drawable.ic_check_box_outline_blank_24
            },
            contentDescription = if (task.status == PodTaskStatus.DONE) "Mark task as open" else "Mark task as done",
            variant = if (task.status == PodTaskStatus.DONE) {
                DustIconButtonVariant.Selected
            } else {
                DustIconButtonVariant.Plain
            },
        )
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(start = DustSpacing.extraSmall),
        ) {
            Text(
                text = task.text,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                textDecoration = if (task.status == PodTaskStatus.DONE) TextDecoration.LineThrough else null,
                color = if (task.status == PodTaskStatus.DONE) {
                    MaterialTheme.colorScheme.contentMuted
                } else {
                    MaterialTheme.colorScheme.onSurface
                },
                style = MaterialTheme.typography.bodyLarge,
            )
            Row(
                modifier = Modifier.padding(top = DustSpacing.extraSmall),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                val assignee = task.user
                if (assignee != null) {
                    DustAvatar(name = assignee.fullName, avatarUrl = assignee.image, size = 20.dp)
                    Text(
                        text = assignee.fullName,
                        modifier = Modifier.padding(start = DustSpacing.extraSmall),
                        color = MaterialTheme.colorScheme.contentMuted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        style = MaterialTheme.typography.bodySmall,
                    )
                } else {
                    Icon(
                        painter = painterResource(R.drawable.ic_person_24),
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                        tint = MaterialTheme.colorScheme.contentMuted,
                    )
                    Text(
                        text = "Unassigned",
                        modifier = Modifier.padding(start = DustSpacing.extraSmall),
                        color = MaterialTheme.colorScheme.contentMuted,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                if (task.status == PodTaskStatus.IN_PROGRESS) {
                    Text(
                        text = " · In progress",
                        color = MaterialTheme.colorScheme.contentMuted,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        }
        if (onOpenConversation != null) {
            Icon(
                painter = painterResource(R.drawable.ic_chat_24),
                contentDescription = "Open linked conversation",
                modifier = Modifier.size(20.dp),
                tint = MaterialTheme.colorScheme.contentMuted,
            )
        }
    }
}
