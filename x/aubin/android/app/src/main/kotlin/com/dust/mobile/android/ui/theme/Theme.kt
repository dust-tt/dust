package com.dust.mobile.android.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import com.dust.mobile.android.R

private val DustLightColors = lightColorScheme(
    primary = Color(0xFF0C0A09),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFFBFAF9),
    onPrimaryContainer = Color(0xFF0C0A09),
    secondary = Color(0xFF1C91FF),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFE9F7FF),
    onSecondaryContainer = Color(0xFF085092),
    tertiary = Color(0xFFE14322),
    onTertiary = Color.White,
    tertiaryContainer = Color(0xFFFFF1F7),
    onTertiaryContainer = Color(0xFF8C230D),
    error = Color(0xFFE14322),
    onError = Color.White,
    errorContainer = Color(0xFFFFF1F7),
    onErrorContainer = Color(0xFF8C230D),
    background = Color.White,
    onBackground = Color(0xFF0C0A09),
    surface = Color.White,
    onSurface = Color(0xFF0C0A09),
    surfaceTint = Color.Transparent,
    surfaceVariant = Color(0xFFFBFAF9),
    onSurfaceVariant = Color(0xFF57534D),
    surfaceBright = Color.White,
    surfaceDim = Color(0xFFFBFAF9),
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Color(0xFFFBFAF9),
    surfaceContainer = Color(0xFFF5F5F4),
    surfaceContainerHigh = Color(0xFFEEEEEC),
    surfaceContainerHighest = Color(0xFFE7E5E4),
    outline = Color(0xFFEEEEEC),
    outlineVariant = Color(0xFFF5F5F4),
    inverseSurface = Color(0xFF0C0A09),
    inverseOnSurface = Color(0xFFE7E5E4),
    inversePrimary = Color(0xFFE7E5E4),
    scrim = Color(0x99000000),
)

private val DustDarkColors = darkColorScheme(
    primary = Color(0xFFE7E5E4),
    onPrimary = Color(0xFF0C0A09),
    primaryContainer = Color(0xFF191715),
    onPrimaryContainer = Color(0xFFE7E5E4),
    secondary = Color(0xFF1C91FF),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFF041728),
    onSecondaryContainer = Color(0xFFCAEBFF),
    tertiary = Color(0xFFE14322),
    onTertiary = Color.White,
    tertiaryContainer = Color(0xFF220A04),
    onTertiaryContainer = Color(0xFFFFDCEC),
    error = Color(0xFFE14322),
    onError = Color.White,
    errorContainer = Color(0xFF220A04),
    onErrorContainer = Color(0xFFFFDCEC),
    background = Color(0xFF141211),
    onBackground = Color(0xFFE7E5E4),
    surface = Color(0xFF141211),
    onSurface = Color(0xFFE7E5E4),
    surfaceTint = Color.Transparent,
    surfaceVariant = Color(0xFF191715),
    onSurfaceVariant = Color(0xFFA6A09B),
    surfaceBright = Color(0xFF262221),
    surfaceDim = Color(0xFF141211),
    surfaceContainerLowest = Color(0xFF0C0A09),
    surfaceContainerLow = Color(0xFF191715),
    surfaceContainer = Color(0xFF1F1C19),
    surfaceContainerHigh = Color(0xFF262221),
    surfaceContainerHighest = Color(0xFF44403B),
    outline = Color(0xFF44403B),
    outlineVariant = Color(0xFF262221),
    inverseSurface = Color(0xFFE7E5E4),
    inverseOnSurface = Color(0xFF0C0A09),
    inversePrimary = Color(0xFF44403B),
    scrim = Color(0xCC000000),
)

private val Geist = FontFamily(
    Font(R.font.geist_regular, FontWeight.Normal),
    Font(R.font.geist_medium, FontWeight.Medium),
    Font(R.font.geist_semibold, FontWeight.SemiBold),
)

private val DustTypography = Typography(
    headlineSmall = TextStyle(
        fontFamily = Geist,
        fontSize = 24.sp,
        lineHeight = 30.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 0.sp,
    ),
    titleLarge = TextStyle(
        fontFamily = Geist,
        fontSize = 20.sp,
        lineHeight = 26.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 0.sp,
    ),
    titleMedium = TextStyle(
        fontFamily = Geist,
        fontSize = 17.sp,
        lineHeight = 22.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 0.sp,
    ),
    titleSmall = TextStyle(
        fontFamily = Geist,
        fontSize = 15.sp,
        lineHeight = 20.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 0.sp,
    ),
    bodyLarge = TextStyle(
        fontFamily = Geist,
        fontSize = 15.sp,
        lineHeight = 22.sp,
        fontWeight = FontWeight.Normal,
        letterSpacing = 0.sp,
    ),
    bodyMedium = TextStyle(
        fontFamily = Geist,
        fontSize = 14.sp,
        lineHeight = 20.sp,
        fontWeight = FontWeight.Normal,
        letterSpacing = 0.sp,
    ),
    bodySmall = TextStyle(
        fontFamily = Geist,
        fontSize = 13.sp,
        lineHeight = 18.sp,
        fontWeight = FontWeight.Normal,
        letterSpacing = 0.sp,
    ),
    labelLarge = TextStyle(
        fontFamily = Geist,
        fontSize = 14.sp,
        lineHeight = 18.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 0.sp,
    ),
    labelMedium = TextStyle(
        fontFamily = Geist,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 0.sp,
    ),
    labelSmall = TextStyle(
        fontFamily = Geist,
        fontSize = 11.sp,
        lineHeight = 14.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 0.sp,
    ),
)

private val DustShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(20.dp),
    extraLarge = RoundedCornerShape(24.dp),
)

@Composable
@Suppress("DEPRECATION")
fun DustTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colorScheme = if (darkTheme) DustDarkColors else DustLightColors
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = colorScheme.background.toArgb()
            window.navigationBarColor = colorScheme.background.toArgb()
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = !darkTheme
                isAppearanceLightNavigationBars = !darkTheme
            }
        }
    }
    MaterialTheme(
        colorScheme = colorScheme,
        typography = DustTypography,
        shapes = DustShapes,
        content = content,
    )
}
