package com.dust.mobile.android.ui.inbox.pod

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.common.DustAvatar
import com.dust.mobile.android.ui.common.DustModalHeader
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.android.ui.theme.action
import com.dust.mobile.android.ui.theme.contentMuted
import com.dust.mobile.core.model.PodMember
import com.dust.mobile.core.model.PodNotificationCondition
import com.dust.mobile.core.model.displayLabel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun PodMembersSheet(
    members: List<PodMember>,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    ) {
        DustModalHeader(title = "Members", onClose = onDismiss)
        Column(Modifier.padding(bottom = DustSpacing.extraLarge)) {
            members.sortedBy { it.fullName.lowercase() }.forEach { member ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 60.dp)
                        .padding(horizontal = DustSpacing.large),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    DustAvatar(
                        name = member.fullName,
                        avatarUrl = member.image,
                        size = 32.dp,
                    )
                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .padding(start = DustSpacing.medium),
                    ) {
                        Text(
                            text = member.fullName,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            style = MaterialTheme.typography.bodyLarge,
                        )
                        member.email?.let { email ->
                            Text(
                                text = email,
                                color = MaterialTheme.colorScheme.contentMuted,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    }
                    if (member.isEditor) {
                        Text(
                            text = "Editor",
                            color = MaterialTheme.colorScheme.contentMuted,
                            style = MaterialTheme.typography.labelMedium,
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun PodNotificationSheet(
    selected: PodNotificationCondition,
    isSaving: Boolean,
    onSelect: (PodNotificationCondition) -> Unit,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    ) {
        DustModalHeader(title = "Notifications", onClose = onDismiss)
        Column(Modifier.padding(bottom = DustSpacing.extraLarge)) {
            PodNotificationCondition.entries.forEach { condition ->
                val isSelected = condition == selected
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 60.dp)
                        .clickable(enabled = !isSaving) { onSelect(condition) }
                        .padding(horizontal = DustSpacing.large),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        painter = painterResource(
                            if (isSelected) R.drawable.ic_check_circle_24 else R.drawable.ic_radio_unchecked_24,
                        ),
                        contentDescription = null,
                        modifier = Modifier.size(22.dp),
                        tint = if (isSelected) {
                            MaterialTheme.colorScheme.action
                        } else {
                            MaterialTheme.colorScheme.contentMuted
                        },
                    )
                    Text(
                        text = condition.displayLabel(),
                        modifier = Modifier.padding(start = DustSpacing.medium),
                        style = MaterialTheme.typography.bodyLarge,
                    )
                }
            }
        }
    }
}
