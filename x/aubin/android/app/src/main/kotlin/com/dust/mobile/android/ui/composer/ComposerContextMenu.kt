package com.dust.mobile.android.ui.composer

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.common.DustIconButton
import com.dust.mobile.android.ui.common.DustModalHeader
import com.dust.mobile.android.ui.theme.DustDimensions
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.android.ui.theme.boundedSurface

private data class ComposerContextAction(
    val label: String,
    val iconRes: Int,
    val onClick: () -> Unit,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ComposerContextButton(
    enabled: Boolean,
    onMenuOpen: () -> Unit,
    onMenuDismiss: () -> Unit,
    onAddPhoto: () -> Unit,
    onAddFile: () -> Unit,
    onShowCapabilities: () -> Unit,
    onShowKnowledge: () -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }

    fun dismissMenu() {
        expanded = false
        onMenuDismiss()
    }

    DustIconButton(
        enabled = enabled,
        onClick = {
            onMenuOpen()
            expanded = true
        },
        iconRes = R.drawable.ic_attach_file_24,
        contentDescription = "Add context",
    )

    if (expanded) {
        ModalBottomSheet(
            onDismissRequest = ::dismissMenu,
            containerColor = MaterialTheme.colorScheme.boundedSurface,
            contentColor = MaterialTheme.colorScheme.onSurface,
            tonalElevation = 0.dp,
        ) {
            DustModalHeader(title = "Add context", onClose = ::dismissMenu)
            Column(modifier = Modifier.padding(horizontal = DustSpacing.small)) {
                listOf(
                    ComposerContextAction("Photos", R.drawable.ic_image_24, onAddPhoto),
                    ComposerContextAction("Files", R.drawable.ic_attach_file_24, onAddFile),
                    ComposerContextAction("Tools & skills", R.drawable.ic_tool_24, onShowCapabilities),
                    ComposerContextAction("Knowledge", R.drawable.ic_search_24, onShowKnowledge),
                ).forEach { action ->
                    DropdownMenuItem(
                        text = { Text(action.label) },
                        leadingIcon = {
                            Icon(
                                painter = painterResource(action.iconRes),
                                contentDescription = null,
                                modifier = Modifier.size(DustDimensions.actionIcon),
                            )
                        },
                        onClick = {
                            expanded = false
                            action.onClick()
                        },
                    )
                }
                Spacer(Modifier.height(DustSpacing.extraLarge))
            }
        }
    }
}
