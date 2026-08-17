package com.dust.mobile.android.ui.composer

import android.content.Context
import android.net.Uri
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

internal fun CoroutineScope.addPickedFiles(
    context: Context,
    uris: List<Uri>,
    onFile: (PickedFile) -> Unit,
) {
    if (uris.isEmpty()) return
    launch {
        val files = withContext(Dispatchers.IO) {
            uris.mapNotNull { uri -> readPickedFileSafely(context, uri) }
        }
        files.forEach(onFile)
    }
}
