package com.dust.mobile.android.ui.composer

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.core.content.ContextCompat
import com.dust.mobile.core.model.SUPPORTED_UPLOAD_MIME_TYPES

internal data class ComposerPlatformActions(
    val addPhoto: () -> Unit,
    val addFile: () -> Unit,
    val addReceivedAttachments: (List<Uri>) -> Unit,
    val startVoiceInput: () -> Unit,
)

@Composable
internal fun rememberComposerPlatformActions(
    isLocalPreview: Boolean,
    focusCoordinator: ComposerFocusCoordinator,
    onFilePicked: (PickedFile) -> Unit,
    onStartVoiceInput: () -> Unit,
    onVoicePermissionDenied: () -> Unit,
): ComposerPlatformActions {
    val context = LocalContext.current
    val focusManager = LocalFocusManager.current
    val keyboardController = LocalSoftwareKeyboardController.current
    val attachmentReadScope = rememberCoroutineScope()
    val currentOnFilePicked = rememberUpdatedState(onFilePicked)
    val currentOnStartVoiceInput = rememberUpdatedState(onStartVoiceInput)
    val currentOnVoicePermissionDenied = rememberUpdatedState(onVoicePermissionDenied)

    val filePicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        focusCoordinator.finishInterruption()
        attachmentReadScope.addPickedFiles(context, uris) { file ->
            currentOnFilePicked.value(file)
        }
    }
    val photoPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.PickMultipleVisualMedia(PHOTO_PICKER_MAX_ITEMS),
    ) { uris ->
        focusCoordinator.finishInterruption()
        attachmentReadScope.addPickedFiles(context, uris) { file ->
            currentOnFilePicked.value(file)
        }
    }
    val micPermissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) {
            currentOnStartVoiceInput.value()
        } else {
            currentOnVoicePermissionDenied.value()
        }
    }

    return ComposerPlatformActions(
        addPhoto = {
            photoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
        },
        addFile = {
            filePicker.launch(SUPPORTED_UPLOAD_MIME_TYPES.toTypedArray())
        },
        addReceivedAttachments = { uris ->
            attachmentReadScope.addPickedFiles(context, uris) { file ->
                currentOnFilePicked.value(file)
            }
        },
        startVoiceInput = {
            focusCoordinator.abandonFocusRestoration()
            focusManager.clearFocus(force = true)
            keyboardController?.hide()
            if (
                isLocalPreview ||
                ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
                PackageManager.PERMISSION_GRANTED
            ) {
                currentOnStartVoiceInput.value()
            } else {
                micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
            }
        },
    )
}
