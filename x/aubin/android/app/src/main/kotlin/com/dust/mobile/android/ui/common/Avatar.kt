package com.dust.mobile.android.ui.common

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.LruCache
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.R
import com.dust.mobile.core.model.User
import com.dust.mobile.core.model.parseEmojiAvatarUrl
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@Composable
internal fun DustAvatar(
    name: String?,
    avatarUrl: String? = null,
    size: Dp = 28.dp,
    isAgent: Boolean = false,
) {
    val identityName = name?.takeIf { it.isNotBlank() }
    val identityUrl = avatarUrl?.takeIf { it.isNotBlank() }
    val fallbackIconRes = if (isAgent) R.drawable.ic_robot_24 else R.drawable.ic_person_24
    if (!hasAvatarIdentity(identityName, identityUrl)) {
        Box(
            modifier = Modifier
                .size(size)
                .semantics { contentDescription = if (isAgent) "Agent" else "User" },
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                painter = painterResource(fallbackIconRes),
                contentDescription = null,
                modifier = Modifier.fillMaxSize(0.6f),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        return
    }
    val emojiAvatar = identityUrl?.let(::parseEmojiAvatarUrl)
    val bundledAvatarRes = identityUrl?.let(::bundledAvatarResource)
    val remoteAvatarUrl = identityUrl?.takeIf {
        it.isNotBlank() && emojiAvatar == null && bundledAvatarRes == null
    }
    var remoteBitmap by remember(remoteAvatarUrl) { mutableStateOf<Bitmap?>(null) }
    LaunchedEffect(remoteAvatarUrl) {
        remoteBitmap = remoteAvatarUrl?.let { loadAvatarBitmap(it) }
    }
    val initial = avatarInitial(identityName)
    val shape = if (isAgent) {
        RoundedCornerShape(
            when {
                size <= 20.dp -> 4.dp
                size <= 28.dp -> 6.dp
                else -> 8.dp
            },
        )
    } else {
        CircleShape
    }
    val palette = sparkleAvatarPalette(identityName.orEmpty())
    val hasVisual = bundledAvatarRes != null || remoteBitmap != null
    Box(
        modifier = Modifier
            .size(size)
            .semantics {
                contentDescription = "${identityName ?: if (isAgent) "Agent" else "User"} avatar"
            }
            .background(
                emojiAvatar?.let { emojiAvatarBackgroundColor(it.backgroundToken) }
                    ?: palette.background,
                shape,
            )
            .then(
                if (hasVisual) {
                    Modifier
                } else {
                    Modifier.border(1.dp, palette.foreground.copy(alpha = 0.12f), shape)
                },
            ),
        contentAlignment = Alignment.Center,
    ) {
        val bitmap = remoteBitmap
        when {
            bundledAvatarRes != null -> Image(
                painter = painterResource(bundledAvatarRes),
                contentDescription = null,
                modifier = Modifier
                    .fillMaxSize()
                    .clip(shape),
                contentScale = ContentScale.Crop,
            )
            bitmap != null -> Image(
                bitmap = bitmap.asImageBitmap(),
                contentDescription = null,
                modifier = Modifier
                    .fillMaxSize()
                    .clip(shape),
                contentScale = ContentScale.Crop,
            )
            emojiAvatar != null || identityName != null -> Text(
                emojiAvatar?.emoji ?: initial,
                style = MaterialTheme.typography.labelSmall,
                color = if (emojiAvatar != null) Color.Unspecified else palette.foreground,
                fontWeight = FontWeight.SemiBold,
            )
            else -> Icon(
                painter = painterResource(fallbackIconRes),
                contentDescription = null,
                modifier = Modifier.fillMaxSize(0.55f),
                tint = palette.foreground,
            )
        }
    }
}

internal fun hasAvatarIdentity(name: String?, avatarUrl: String?): Boolean =
    !name.isNullOrBlank() || !avatarUrl.isNullOrBlank()

internal fun avatarInitial(name: String?): String =
    name?.firstOrNull { it.isLetterOrDigit() }?.uppercaseChar()?.toString() ?: "U"

private suspend fun loadAvatarBitmap(urlString: String): Bitmap? =
    withContext(Dispatchers.IO) {
        avatarBitmapCache.get(urlString) ?: runCatching {
            val connection = URL(urlString).openConnection()
            connection.connectTimeout = AVATAR_CONNECT_TIMEOUT_MS
            connection.readTimeout = AVATAR_READ_TIMEOUT_MS
            connection.getInputStream().use(BitmapFactory::decodeStream)
        }.getOrNull()?.also { bitmap -> avatarBitmapCache.put(urlString, bitmap) }
    }

private fun bundledAvatarResource(urlString: String): Int? =
    when (urlString.substringBefore('?').substringAfterLast('/')) {
        "dust_avatar_full.png" -> R.drawable.dust_agent_avatar
        "Droid_Lime_1.jpg" -> R.drawable.droid_lime_1
        "Droid_Pink_3.jpg" -> R.drawable.droid_pink_3
        "Droid_Yellow_2.jpg" -> R.drawable.droid_yellow_2
        else -> null
    }

private data class AvatarPalette(val background: Color, val foreground: Color)

private fun sparkleAvatarPalette(name: String): AvatarPalette {
    var hash = 0
    name.forEach { character ->
        hash = character.code + ((hash shl 5) - hash)
    }
    return SPARKLE_AVATAR_PALETTES[(hash and Int.MAX_VALUE) % SPARKLE_AVATAR_PALETTES.size]
}

private val avatarBitmapCache = LruCache<String, Bitmap>(32)

private val SPARKLE_AVATAR_PALETTES = listOf(
    AvatarPalette(background = Color(0xFF7AC6FF), foreground = Color(0xFF0A6CC6)),
    AvatarPalette(background = Color(0xFFC4B4FF), foreground = Color(0xFF7008E7)),
    AvatarPalette(background = Color(0xFFF99BC3), foreground = Color(0xFFB8315E)),
    AvatarPalette(background = Color(0xFFEC8874), foreground = Color(0xFFB22E13)),
    AvatarPalette(background = Color(0xFFFFB86A), foreground = Color(0xFFCA3500)),
    AvatarPalette(background = Color(0xFFFFD046), foreground = Color(0xFFE27716)),
    AvatarPalette(background = Color(0xFFCCF16E), foreground = Color(0xFF4D7C0F)),
    AvatarPalette(background = Color(0xFF82EFB8), foreground = Color(0xFF277644)),
)

private fun emojiAvatarBackgroundColor(token: String): Color {
    val familyToken = token.substringBeforeLast("-", missingDelimiterValue = token)
    val family = EMOJI_AVATAR_FAMILY_ALIASES[familyToken] ?: familyToken
    return when (family) {
        "blue" -> Color(0xFFBFDBFE)
        "emerald" -> Color(0xFFA7F3D0)
        "golden" -> Color(0xFFFDE68A)
        "gray" -> Color(0xFFE5E7EB)
        "green" -> Color(0xFFBBF7D0)
        "lime" -> Color(0xFFD9F99D)
        "orange" -> Color(0xFFFED7AA)
        "pink" -> Color(0xFFFBCFE8)
        "red" -> Color(0xFFFECACA)
        "rose" -> Color(0xFFFFE4E6)
        "violet" -> Color(0xFFDDD6FE)
        else -> Color(0xFFE5E7EB)
    }
}

private val EMOJI_AVATAR_FAMILY_ALIASES = mapOf(
    "yellow" to "golden",
    "amber" to "golden",
    "sky" to "blue",
    "cyan" to "blue",
    "teal" to "emerald",
    "indigo" to "violet",
    "purple" to "violet",
    "fuchsia" to "pink",
    "slate" to "gray",
    "zinc" to "gray",
    "neutral" to "gray",
    "stone" to "gray",
)

private const val AVATAR_CONNECT_TIMEOUT_MS = 5_000
private const val AVATAR_READ_TIMEOUT_MS = 5_000
