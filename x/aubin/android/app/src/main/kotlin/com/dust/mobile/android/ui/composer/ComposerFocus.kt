package com.dust.mobile.android.ui.composer

import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

@Stable
internal class ComposerFocusCoordinator {
    var isInputFocused by mutableStateOf(false)
        private set

    var focusRequestId by mutableIntStateOf(0)
        private set

    var focusRequestShouldShowKeyboard by mutableStateOf(true)
        private set

    private var interruptionActive = false
    private var restoreFocusAfterInterruption = false
    private var restoreKeyboardAfterInterruption = false
    private var wasImeVisible = false

    fun onInputFocusChanged(isFocused: Boolean) {
        isInputFocused = isFocused
    }

    fun requestFocus(showKeyboard: Boolean = true) {
        focusRequestShouldShowKeyboard = showKeyboard
        focusRequestId += 1
    }

    fun beginInterruption(isImeVisible: Boolean) {
        if (!interruptionActive) {
            restoreFocusAfterInterruption = isInputFocused
            restoreKeyboardAfterInterruption = isInputFocused && isImeVisible
            interruptionActive = true
        }
    }

    fun finishInterruption() {
        if (!interruptionActive) return
        val shouldRestoreFocus = restoreFocusAfterInterruption
        val shouldRestoreKeyboard = restoreKeyboardAfterInterruption
        interruptionActive = false
        restoreFocusAfterInterruption = false
        restoreKeyboardAfterInterruption = false
        if (shouldRestoreFocus) {
            requestFocus(showKeyboard = shouldRestoreKeyboard)
        }
    }

    fun cancelInterruption() {
        interruptionActive = false
        restoreFocusAfterInterruption = false
        restoreKeyboardAfterInterruption = false
    }

    fun onImeVisibilityChanged(isImeVisible: Boolean): Boolean {
        val wasDismissed = wasImeVisible && !isImeVisible
        wasImeVisible = isImeVisible
        if (!wasDismissed) return false
        return isInputFocused
    }

    fun abandonFocusRestoration() {
        cancelInterruption()
    }
}
