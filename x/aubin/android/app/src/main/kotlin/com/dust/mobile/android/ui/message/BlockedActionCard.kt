package com.dust.mobile.android.ui.message

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.common.DustButton
import com.dust.mobile.android.ui.theme.DustRadii
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.android.ui.theme.boundedSurface
import com.dust.mobile.android.ui.theme.contentMuted
import com.dust.mobile.android.ui.theme.subtleBorder
import com.dust.mobile.core.model.ActionApproval
import com.dust.mobile.core.model.BlockedState
import com.dust.mobile.core.model.UserQuestionAnswer
import com.dust.mobile.core.model.canRespondToBlockedAction

@Composable
internal fun BlockedActionCard(
    blockedState: BlockedState?,
    isLoading: Boolean,
    error: String?,
    onValidate: (ActionApproval) -> Unit,
    onAnswer: (UserQuestionAnswer) -> Unit,
    onOpenInBrowser: (() -> Unit)?,
    currentUserSId: String?,
) {
    if (blockedState == null && error == null) return

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(DustRadii.control),
        color = MaterialTheme.colorScheme.boundedSurface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.subtleBorder),
    ) {
        Column(
            modifier = Modifier.padding(DustSpacing.medium),
            verticalArrangement = Arrangement.spacedBy(DustSpacing.medium),
        ) {
            when (blockedState) {
                is BlockedState.Approval -> BlockedApprovalContent(
                    blockedState = blockedState,
                    isLoading = isLoading,
                    currentUserSId = currentUserSId,
                    onValidate = onValidate,
                )
                is BlockedState.PersonalAuth -> BlockedExternalActionContent(
                    title = "${blockedState.provider} needs authentication",
                    description = "Connect this service in the web app to continue.",
                    onOpenInBrowser = onOpenInBrowser,
                )
                is BlockedState.FileAuth -> BlockedExternalActionContent(
                    title = "File access required",
                    description = "${blockedState.toolName} needs access to ${blockedState.fileName}.",
                    onOpenInBrowser = onOpenInBrowser,
                )
                is BlockedState.UserQuestionRequired -> UserQuestionCard(
                    question = blockedState.question.question,
                    isLoading = isLoading,
                    canRespond = canRespondToBlockedAction(
                        blockedState.question.triggeringUserId,
                        currentUserSId,
                    ),
                    onAnswer = onAnswer,
                )
                null -> Unit
            }
            error?.let { message ->
                Text(
                    text = message,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }
}

@Composable
private fun BlockedExternalActionContent(
    title: String,
    description: String,
    onOpenInBrowser: (() -> Unit)?,
) {
    Text(title, style = MaterialTheme.typography.labelLarge)
    Text(
        text = description,
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.contentMuted,
    )
    if (onOpenInBrowser != null) {
        DustButton(
            label = "Open in Dust",
            onClick = onOpenInBrowser,
            modifier = Modifier.fillMaxWidth(),
            iconRes = R.drawable.ic_open_in_browser_24,
        )
    }
}

@Composable
internal fun BlockedWaitingView(label: String) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(DustSpacing.small),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.contentMuted,
        )
    }
}
