package com.dust.mobile.android.ui.preview

import android.content.res.Configuration
import androidx.compose.ui.tooling.preview.Preview

@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.BINARY)
@Preview(
    name = "Samsung phone",
    group = "Phone",
    device = "spec:width=384dp,height=854dp,dpi=420",
    showBackground = true,
)
@Preview(
    name = "Large text",
    group = "Accessibility",
    device = "spec:width=384dp,height=854dp,dpi=420",
    fontScale = 1.3f,
    showBackground = true,
)
@Preview(
    name = "Dark",
    group = "Dark mode",
    device = "spec:width=384dp,height=854dp,dpi=420",
    uiMode = Configuration.UI_MODE_NIGHT_YES,
    showBackground = true,
)
internal annotation class DustScreenPreviews

@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.BINARY)
@Preview(name = "Phone", group = "Phone", widthDp = 384, showBackground = true)
@Preview(
    name = "Large text",
    group = "Accessibility",
    widthDp = 384,
    fontScale = 1.3f,
    showBackground = true,
)
@Preview(
    name = "Dark",
    group = "Dark mode",
    widthDp = 384,
    uiMode = Configuration.UI_MODE_NIGHT_YES,
    showBackground = true,
)
internal annotation class DustComponentPreviews
