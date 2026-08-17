package com.dust.mobile.android.ui.conversation.files

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.ui.message.DustMarkdownText

@Composable
internal fun TextPreview(text: String) {
    LazyColumn(Modifier.fillMaxSize()) {
        item {
            DustMarkdownText(
                content = text,
                modifier = Modifier.padding(16.dp),
                selectable = true,
            )
        }
    }
}
