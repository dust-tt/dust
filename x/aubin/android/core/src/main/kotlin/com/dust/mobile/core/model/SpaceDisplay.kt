package com.dust.mobile.core.model

fun Space.visibilityLabel(): String =
    if (isRestricted) "Closed" else "Open"
