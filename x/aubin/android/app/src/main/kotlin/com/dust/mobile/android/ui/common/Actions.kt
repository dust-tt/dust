package com.dust.mobile.android.ui.common

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.ui.theme.DustDimensions
import com.dust.mobile.android.ui.theme.DustRadii
import com.dust.mobile.android.ui.theme.action
import com.dust.mobile.android.ui.theme.actionContainer
import com.dust.mobile.android.ui.theme.contentMuted
import com.dust.mobile.android.ui.theme.contentStrong
import com.dust.mobile.android.ui.theme.interactiveSurface
import com.dust.mobile.android.ui.theme.onAction
import com.dust.mobile.android.ui.theme.subtleBorder

internal enum class DustButtonVariant {
    Primary,
    Secondary,
    Outline,
    Destructive,
    Text,
    NeutralText,
    DestructiveText,
}

@Composable
internal fun DustButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
    variant: DustButtonVariant = DustButtonVariant.Primary,
    iconRes: Int? = null,
) {
    val buttonModifier = modifier.heightIn(min = DustDimensions.controlHeight)
    val shape = RoundedCornerShape(DustRadii.control)
    val contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp)
    val content: @Composable RowScope.() -> Unit = {
        if (loading) {
            CircularProgressIndicator(
                modifier = Modifier.size(DustDimensions.inlineIcon),
                color = LocalContentColor.current,
                strokeWidth = 2.dp,
            )
        } else if (iconRes != null) {
            Icon(
                painter = painterResource(iconRes),
                contentDescription = null,
                modifier = Modifier.size(DustDimensions.inlineIcon),
            )
        }
        if (loading || iconRes != null) {
            Spacer(Modifier.width(8.dp))
        }
        Text(label)
    }

    when (variant) {
        DustButtonVariant.Primary -> Button(
            modifier = buttonModifier,
            onClick = onClick,
            enabled = enabled && !loading,
            shape = shape,
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.action,
                contentColor = MaterialTheme.colorScheme.onAction,
            ),
            contentPadding = contentPadding,
            content = content,
        )

        DustButtonVariant.Secondary -> Button(
            modifier = buttonModifier,
            onClick = onClick,
            enabled = enabled && !loading,
            shape = shape,
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.interactiveSurface,
                contentColor = MaterialTheme.colorScheme.contentStrong,
            ),
            elevation = ButtonDefaults.buttonElevation(0.dp, 0.dp, 0.dp, 0.dp, 0.dp),
            contentPadding = contentPadding,
            content = content,
        )

        DustButtonVariant.Outline -> OutlinedButton(
            modifier = buttonModifier,
            onClick = onClick,
            enabled = enabled && !loading,
            shape = shape,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.subtleBorder),
            colors = ButtonDefaults.outlinedButtonColors(
                contentColor = MaterialTheme.colorScheme.contentStrong,
            ),
            contentPadding = contentPadding,
            content = content,
        )

        DustButtonVariant.Destructive -> Button(
            modifier = buttonModifier,
            onClick = onClick,
            enabled = enabled && !loading,
            shape = shape,
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.error,
                contentColor = MaterialTheme.colorScheme.onError,
            ),
            contentPadding = contentPadding,
            content = content,
        )

        DustButtonVariant.Text -> TextButton(
            modifier = buttonModifier,
            onClick = onClick,
            enabled = enabled && !loading,
            shape = shape,
            colors = ButtonDefaults.textButtonColors(
                contentColor = MaterialTheme.colorScheme.action,
            ),
            contentPadding = contentPadding,
            content = content,
        )

        DustButtonVariant.NeutralText -> TextButton(
            modifier = buttonModifier,
            onClick = onClick,
            enabled = enabled && !loading,
            shape = shape,
            colors = ButtonDefaults.textButtonColors(
                contentColor = MaterialTheme.colorScheme.contentMuted,
            ),
            contentPadding = contentPadding,
            content = content,
        )

        DustButtonVariant.DestructiveText -> TextButton(
            modifier = buttonModifier,
            onClick = onClick,
            enabled = enabled && !loading,
            shape = shape,
            colors = ButtonDefaults.textButtonColors(
                contentColor = MaterialTheme.colorScheme.error,
            ),
            contentPadding = contentPadding,
            content = content,
        )
    }
}

internal enum class DustIconButtonVariant {
    Plain,
    Selected,
    Primary,
    Destructive,
}

@Composable
internal fun DustIconButton(
    onClick: () -> Unit,
    iconRes: Int,
    contentDescription: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
    variant: DustIconButtonVariant = DustIconButtonVariant.Plain,
) {
    val containerColor = when (variant) {
        DustIconButtonVariant.Plain,
        DustIconButtonVariant.Destructive,
        -> Color.Transparent

        DustIconButtonVariant.Selected -> MaterialTheme.colorScheme.actionContainer
        DustIconButtonVariant.Primary -> MaterialTheme.colorScheme.action
    }
    val enabledContentColor = when (variant) {
        DustIconButtonVariant.Plain -> MaterialTheme.colorScheme.contentMuted
        DustIconButtonVariant.Selected -> MaterialTheme.colorScheme.action
        DustIconButtonVariant.Primary -> MaterialTheme.colorScheme.onAction
        DustIconButtonVariant.Destructive -> MaterialTheme.colorScheme.error
    }
    val contentColor = if (enabled) {
        enabledContentColor
    } else {
        enabledContentColor.copy(alpha = 0.38f)
    }

    Surface(
        modifier = modifier
            .size(DustDimensions.minimumTouchTarget),
        shape = RoundedCornerShape(
            if (variant == DustIconButtonVariant.Primary) {
                DustRadii.prominentControl
            } else {
                DustRadii.control
            },
        ),
        color = containerColor,
        contentColor = contentColor,
    ) {
        IconButton(
            modifier = Modifier
                .fillMaxSize()
                .semantics { this.contentDescription = contentDescription },
            enabled = enabled && !loading,
            onClick = onClick,
        ) {
            if (loading) {
                CircularProgressIndicator(
                    modifier = Modifier.size(DustDimensions.inlineIcon),
                    color = contentColor,
                    strokeWidth = 2.dp,
                )
            } else {
                Icon(
                    painter = painterResource(iconRes),
                    contentDescription = null,
                    modifier = Modifier.size(DustDimensions.actionIcon),
                    tint = contentColor,
                )
            }
        }
    }
}
