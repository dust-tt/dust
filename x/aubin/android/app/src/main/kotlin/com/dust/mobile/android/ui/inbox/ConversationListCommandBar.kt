package com.dust.mobile.android.ui.inbox

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.common.DustIconButton
import com.dust.mobile.android.ui.common.DustIconButtonVariant
import com.dust.mobile.android.ui.common.DustSearchField
import com.dust.mobile.android.ui.theme.DustDimensions
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.android.ui.theme.subtleBorder

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun ConversationListCommandBar(
    searchText: String,
    focusRequestId: Int = 0,
    onSearch: (String) -> Unit,
    onNewConversation: () -> Unit,
) {
    var isSearchFocused by remember { mutableStateOf(false) }
    var wasSearchImeVisible by remember { mutableStateOf(false) }
    val focusManager = LocalFocusManager.current
    val keyboardController = LocalSoftwareKeyboardController.current
    val isImeVisible = WindowInsets.isImeVisible
    val focusRequester = remember { FocusRequester() }

    LaunchedEffect(focusRequestId) {
        if (focusRequestId > 0) {
            focusRequester.requestFocus()
            keyboardController?.show()
        }
    }

    fun exitSearch() {
        focusManager.clearFocus(force = true)
        keyboardController?.hide()
        isSearchFocused = false
    }

    BackHandler(enabled = isSearchFocused, onBack = ::exitSearch)
    LaunchedEffect(isImeVisible) {
        if (isSearchFocused && wasSearchImeVisible && !isImeVisible) {
            exitSearch()
        }
        wasSearchImeVisible = isImeVisible
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(
                horizontal = DustDimensions.bottomBarHorizontalPadding,
                vertical = DustSpacing.small,
            ),
        horizontalArrangement = Arrangement.spacedBy(DustSpacing.small),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        DustSearchField(
            value = searchText,
            onValueChange = onSearch,
            placeholder = if (isSearchFocused) "Search conversations" else "Search",
            modifier = Modifier.weight(1f),
            showBackButton = isSearchFocused,
            onBack = ::exitSearch,
            onFocusChanged = { isSearchFocused = it },
            onSearch = ::exitSearch,
            focusRequester = focusRequester,
        )
        if (!isSearchFocused) {
            DustIconButton(
                onClick = onNewConversation,
                iconRes = R.drawable.ic_chat_plus_24,
                contentDescription = "New conversation",
                variant = DustIconButtonVariant.Primary,
            )
        }
    }
}
