package com.dust.mobile.core.model

fun LightAgentConfiguration.favoriteLabel(): String? =
    if (userFavorite) "Favorite" else null
