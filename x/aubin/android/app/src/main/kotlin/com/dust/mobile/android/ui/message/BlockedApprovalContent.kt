package com.dust.mobile.android.ui.message

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.core.FastOutLinearInEasing
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.clickable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.common.DustButton
import com.dust.mobile.android.ui.common.DustButtonVariant
import com.dust.mobile.android.ui.common.motionEnabled
import com.dust.mobile.android.ui.theme.DustDimensions
import com.dust.mobile.android.ui.theme.DustRadii
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.android.ui.theme.contentMuted
import com.dust.mobile.android.ui.theme.interactiveSurface
import com.dust.mobile.android.ui.theme.subtleBorder
import com.dust.mobile.core.model.ActionApproval
import com.dust.mobile.core.model.BlockedState
import com.dust.mobile.core.model.canRespondToBlockedAction
import com.dust.mobile.core.model.toolApprovalDisplay

@Composable
internal fun BlockedApprovalContent(
    blockedState: BlockedState.Approval,
    isLoading: Boolean,
    currentUserSId: String?,
    onValidate: (ActionApproval) -> Unit,
) {
    val approval = blockedState.approval
    val canRespond = canRespondToBlockedAction(approval.triggeringUserId, currentUserSId)
    val display = remember(approval) { toolApprovalDisplay(approval) }
    val isMotionEnabled = motionEnabled()
    var showDetails by remember(approval.actionId) { mutableStateOf(false) }
    var alwaysAllow by remember(approval.actionId) { mutableStateOf(false) }
    val hasInputs = display.inputs.isNotEmpty()
    val chevronRotation by animateFloatAsState(
        targetValue = if (showDetails) 90f else 0f,
        animationSpec = tween(durationMillis = if (isMotionEnabled) 160 else 0),
        label = "approval-details-chevron",
    )

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = DustDimensions.minimumTouchTarget)
            .clickable(enabled = hasInputs) { showDetails = !showDetails },
        horizontalArrangement = Arrangement.spacedBy(DustSpacing.small),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            painter = painterResource(R.drawable.ic_tune_24),
            contentDescription = null,
            modifier = Modifier.size(18.dp),
            tint = MaterialTheme.colorScheme.contentMuted,
        )
        Text(
            text = display.title,
            modifier = Modifier.weight(1f),
            style = MaterialTheme.typography.labelLarge,
        )
        if (hasInputs) {
            Icon(
                painter = painterResource(R.drawable.ic_chevron_right_24),
                contentDescription = if (showDetails) "Hide details" else "Show details",
                modifier = Modifier
                    .size(12.dp)
                    .graphicsLayer { rotationZ = chevronRotation },
                tint = MaterialTheme.colorScheme.contentMuted,
            )
        }
    }
    AnimatedVisibility(
        visible = showDetails,
        enter = expandVertically(
            animationSpec = tween(
                durationMillis = if (isMotionEnabled) 180 else 0,
                easing = FastOutSlowInEasing,
            ),
            expandFrom = Alignment.Top,
        ) + fadeIn(
            tween(
                durationMillis = if (isMotionEnabled) 140 else 0,
                easing = LinearOutSlowInEasing,
            ),
        ),
        exit = shrinkVertically(
            animationSpec = tween(
                durationMillis = if (isMotionEnabled) 150 else 0,
                easing = FastOutSlowInEasing,
            ),
            shrinkTowards = Alignment.Top,
        ) + fadeOut(
            tween(
                durationMillis = if (isMotionEnabled) 100 else 0,
                easing = FastOutLinearInEasing,
            ),
        ),
    ) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(DustRadii.control),
            color = MaterialTheme.colorScheme.interactiveSurface,
        ) {
            Column(
                modifier = Modifier.padding(DustSpacing.medium),
                verticalArrangement = Arrangement.spacedBy(DustSpacing.small),
            ) {
                display.inputs.forEach { (key, value) ->
                    Column(verticalArrangement = Arrangement.spacedBy(DustSpacing.extraSmall)) {
                        Text(
                            text = key,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.contentMuted,
                        )
                        SelectionContainer {
                            Text(text = value, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
        }
    }
    HorizontalDivider(color = MaterialTheme.colorScheme.subtleBorder)
    if (canRespond) {
        ApprovalActions(
            canAlwaysAllow = display.canAlwaysAllow,
            approveLabel = display.approveLabel,
            alwaysAllow = alwaysAllow,
            onAlwaysAllowChange = { alwaysAllow = it },
            isLoading = isLoading,
            onValidate = onValidate,
        )
    } else {
        BlockedWaitingView("Waiting for a teammate to approve this.")
    }
}

@Composable
private fun ApprovalActions(
    canAlwaysAllow: Boolean,
    approveLabel: String,
    alwaysAllow: Boolean,
    onAlwaysAllowChange: (Boolean) -> Unit,
    isLoading: Boolean,
    onValidate: (ActionApproval) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(DustSpacing.small)) {
        if (canAlwaysAllow) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = DustDimensions.minimumTouchTarget)
                    .toggleable(
                        value = alwaysAllow,
                        enabled = !isLoading,
                        role = Role.Checkbox,
                        onValueChange = onAlwaysAllowChange,
                    ),
                horizontalArrangement = Arrangement.spacedBy(DustSpacing.small),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Checkbox(
                    checked = alwaysAllow,
                    onCheckedChange = null,
                    enabled = !isLoading,
                )
                Text(
                    text = "Always allow this action",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.contentMuted,
                )
            }
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(DustSpacing.small),
        ) {
            DustButton(
                label = "Decline",
                enabled = !isLoading,
                onClick = { onValidate(ActionApproval.REJECTED) },
                modifier = Modifier.weight(1f),
                variant = DustButtonVariant.Outline,
            )
            DustButton(
                label = if (alwaysAllow) "Always allow" else approveLabel,
                enabled = !isLoading,
                onClick = {
                    onValidate(
                        if (alwaysAllow) ActionApproval.ALWAYS_APPROVED else ActionApproval.APPROVED,
                    )
                },
                modifier = Modifier.weight(1f),
            )
        }
    }
}
