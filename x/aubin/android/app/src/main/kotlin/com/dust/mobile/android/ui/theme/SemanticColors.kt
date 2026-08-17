package com.dust.mobile.android.ui.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.ui.graphics.Color

internal val ColorScheme.action: Color
    get() = secondary

internal val ColorScheme.onAction: Color
    get() = onSecondary

internal val ColorScheme.actionContainer: Color
    get() = secondaryContainer

internal val ColorScheme.onActionContainer: Color
    get() = onSecondaryContainer

internal val ColorScheme.interactiveSurface: Color
    get() = surfaceContainerLow

internal val ColorScheme.boundedSurface: Color
    get() = surface

internal val ColorScheme.subtleBorder: Color
    get() = outlineVariant

internal val ColorScheme.contentStrong: Color
    get() = onSurface

internal val ColorScheme.contentMuted: Color
    get() = onSurfaceVariant
