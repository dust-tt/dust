package com.dust.mobile.android.ui.inbox

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.theme.DustDimensions
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.android.ui.theme.actionContainer
import com.dust.mobile.android.ui.theme.onActionContainer

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ConversationRowSwipeBackground(
    direction: SwipeToDismissBoxValue,
    markReadLabel: String,
) {
    if (direction == SwipeToDismissBoxValue.Settled) return

    val isDelete = direction == SwipeToDismissBoxValue.EndToStart
    val iconRes = when {
        isDelete -> R.drawable.ic_delete_24
        markReadLabel == "Mark read" -> R.drawable.ic_check_24
        else -> R.drawable.ic_chat_24
    }
    val containerColor = if (isDelete) {
        MaterialTheme.colorScheme.errorContainer
    } else {
        MaterialTheme.colorScheme.actionContainer
    }
    val contentColor = if (isDelete) {
        MaterialTheme.colorScheme.onErrorContainer
    } else {
        MaterialTheme.colorScheme.onActionContainer
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(containerColor)
            .padding(horizontal = 24.dp),
        contentAlignment = if (isDelete) Alignment.CenterEnd else Alignment.CenterStart,
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(DustSpacing.small),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                painter = painterResource(iconRes),
                contentDescription = null,
                modifier = Modifier.size(DustDimensions.inlineIcon),
                tint = contentColor,
            )
            Text(
                text = if (isDelete) "Delete" else markReadLabel,
                color = contentColor,
                style = MaterialTheme.typography.labelLarge,
            )
        }
    }
}
