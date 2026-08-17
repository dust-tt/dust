package com.dust.mobile.android.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dust.mobile.android.R

private val DustLightColors = lightColorScheme(
    primary = Color(0xFF0C0A09),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFF5F5F4),
    onPrimaryContainer = Color(0xFF0C0A09),
    secondary = Color(0xFF0B79C9),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFE7F3FB),
    onSecondaryContainer = Color(0xFF064A7A),
    tertiary = Color(0xFF8A5A00),
    onTertiary = Color.White,
    tertiaryContainer = Color(0xFFFFF2C6),
    onTertiaryContainer = Color(0xFF4A3000),
    error = Color(0xFFC7364F),
    onError = Color.White,
    errorContainer = Color(0xFFFFE9ED),
    onErrorContainer = Color(0xFF711A2B),
    background = Color(0xFFFBFAF9),
    onBackground = Color(0xFF0C0A09),
    surface = Color.White,
    onSurface = Color(0xFF0C0A09),
    surfaceTint = Color.Transparent,
    surfaceVariant = Color(0xFFF8F7F6),
    onSurfaceVariant = Color(0xFF57534D),
    surfaceBright = Color.White,
    surfaceDim = Color(0xFFFBFAF9),
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Color(0xFFFBFAF9),
    surfaceContainer = Color(0xFFF5F5F4),
    surfaceContainerHigh = Color(0xFFEEEEEC),
    surfaceContainerHighest = Color(0xFFE7E5E4),
    outline = Color(0xFFD6D3D1),
    outlineVariant = Color(0xFFEEEEEC),
    inverseSurface = Color(0xFF0C0A09),
    inverseOnSurface = Color(0xFFE7E5E4),
    inversePrimary = Color(0xFFE7E5E4),
    scrim = Color(0x99000000),
)

private val DustDarkColors = darkColorScheme(
    primary = Color(0xFFE7E5E4),
    onPrimary = Color(0xFF0C0A09),
    primaryContainer = Color(0xFF262321),
    onPrimaryContainer = Color(0xFFE7E5E4),
    secondary = Color(0xFF66B8F6),
    onSecondary = Color(0xFF072036),
    secondaryContainer = Color(0xFF0B3150),
    onSecondaryContainer = Color(0xFFD7EDFF),
    tertiary = Color(0xFFF2C05A),
    onTertiary = Color(0xFF3D2800),
    tertiaryContainer = Color(0xFF493300),
    onTertiaryContainer = Color(0xFFFFE8A3),
    error = Color(0xFFFF8A9B),
    onError = Color(0xFF4D0B16),
    errorContainer = Color(0xFF5D1625),
    onErrorContainer = Color(0xFFFFD9E0),
    background = Color(0xFF171514),
    onBackground = Color(0xFFE7E5E4),
    surface = Color(0xFF1B1918),
    onSurface = Color(0xFFE7E5E4),
    surfaceTint = Color.Transparent,
    surfaceVariant = Color(0xFF211F1D),
    onSurfaceVariant = Color(0xFFA6A09B),
    surfaceBright = Color(0xFF262221),
    surfaceDim = Color(0xFF171514),
    surfaceContainerLowest = Color(0xFF12100F),
    surfaceContainerLow = Color(0xFF211F1D),
    surfaceContainer = Color(0xFF292624),
    surfaceContainerHigh = Color(0xFF35312E),
    surfaceContainerHighest = Color(0xFF46413D),
    outline = Color(0xFF57534D),
    outlineVariant = Color(0xFF35312E),
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
    extraSmall = RoundedCornerShape(6.dp),
    small = RoundedCornerShape(8.dp),
    medium = RoundedCornerShape(12.dp),
    large = RoundedCornerShape(16.dp),
    extraLarge = RoundedCornerShape(20.dp),
)

@Composable
fun DustTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colorScheme = if (darkTheme) DustDarkColors else DustLightColors
    MaterialTheme(
        colorScheme = colorScheme,
        typography = DustTypography,
        shapes = DustShapes,
        content = content,
    )
}
