package com.dust.mobile.android.ui.inbox

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.ui.common.DustButton
import com.dust.mobile.android.ui.common.DustButtonVariant

@Composable
internal fun CatchUpFeedback(
    state: CatchUpState,
    onRetryMessages: () -> Unit,
    onRetrySave: () -> Unit,
    onLeaveWithoutSaving: () -> Unit,
) {
    val error = state.saveError ?: state.error ?: return
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        Text(
            error,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
            color = MaterialTheme.colorScheme.error,
            style = MaterialTheme.typography.bodySmall,
        )
        DustButton(
            label = "Try again",
            enabled = !state.isFlushing && !state.isLoadingMessages,
            variant = DustButtonVariant.Text,
            onClick = if (state.saveError != null) onRetrySave else onRetryMessages,
        )
        if (state.saveError != null) {
            DustButton(
                label = "Leave without saving",
                enabled = !state.isFlushing,
                variant = DustButtonVariant.NeutralText,
                onClick = onLeaveWithoutSaving,
            )
        }
    }
}
