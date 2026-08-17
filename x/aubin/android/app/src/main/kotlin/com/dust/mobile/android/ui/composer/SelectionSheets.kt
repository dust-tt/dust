package com.dust.mobile.android.ui.composer

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.ui.common.DustModalHeader
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.android.ui.theme.boundedSurface
import com.dust.mobile.core.model.Capability
import com.dust.mobile.core.model.KnowledgeItem

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun CapabilitySelectionSheet(
    capabilities: List<Capability>,
    selected: List<Capability>,
    onDismiss: () -> Unit,
    onSelect: (Capability) -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = MaterialTheme.colorScheme.boundedSurface,
        contentColor = MaterialTheme.colorScheme.onSurface,
        tonalElevation = 0.dp,
    ) {
        Column(Modifier.fillMaxHeight(0.86f)) {
            DustModalHeader(title = "Tools & skills", onClose = onDismiss)
            Box(
                Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .padding(horizontal = DustSpacing.large),
            ) {
                CapabilitySelector(
                    capabilities = capabilities,
                    selected = selected,
                    onToggle = onSelect,
                    modifier = Modifier.fillMaxSize(),
                )
            }
            Spacer(Modifier.height(DustSpacing.extraLarge))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun KnowledgeSelectionSheet(
    query: String,
    results: List<KnowledgeItem>,
    selected: List<KnowledgeItem>,
    isSearching: Boolean,
    onQueryChange: (String) -> Unit,
    onDismiss: () -> Unit,
    onSelect: (KnowledgeItem) -> Unit,
) {
    val focusRequester = remember { FocusRequester() }
    val keyboardController = LocalSoftwareKeyboardController.current

    LaunchedEffect(focusRequester) {
        repeat(2) { withFrameNanos { } }
        focusRequester.requestFocus()
        withFrameNanos { }
        keyboardController?.show()
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = MaterialTheme.colorScheme.boundedSurface,
        contentColor = MaterialTheme.colorScheme.onSurface,
        tonalElevation = 0.dp,
    ) {
        Column(Modifier.fillMaxHeight(0.86f)) {
            DustModalHeader(title = "Knowledge", onClose = onDismiss)
            Box(
                Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .padding(horizontal = DustSpacing.large),
            ) {
                KnowledgeSelector(
                    query = query,
                    results = results,
                    selected = selected,
                    isSearching = isSearching,
                    onQueryChange = onQueryChange,
                    onToggle = onSelect,
                    focusRequester = focusRequester,
                    modifier = Modifier.fillMaxSize(),
                )
            }
            Spacer(Modifier.height(DustSpacing.extraLarge))
        }
    }
}
