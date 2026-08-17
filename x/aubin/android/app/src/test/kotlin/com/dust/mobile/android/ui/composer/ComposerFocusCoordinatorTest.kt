package com.dust.mobile.android.ui.composer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ComposerFocusCoordinatorTest {
    @Test
    fun `new draft can request focus explicitly`() {
        val coordinator = ComposerFocusCoordinator()

        coordinator.requestFocus()

        assertEquals(1, coordinator.focusRequestId)
    }

    @Test
    fun `overlay restores active editing after it closes`() {
        val coordinator = ComposerFocusCoordinator()
        coordinator.onInputFocusChanged(true)

        coordinator.beginInterruption(isImeVisible = true)
        coordinator.onInputFocusChanged(false)
        coordinator.finishInterruption()

        assertEquals(1, coordinator.focusRequestId)
        assertTrue(coordinator.focusRequestShouldShowKeyboard)
    }

    @Test
    fun `nested overlay transition preserves the original editing intent`() {
        val coordinator = ComposerFocusCoordinator()
        coordinator.onInputFocusChanged(true)

        coordinator.beginInterruption(isImeVisible = true)
        coordinator.onInputFocusChanged(false)
        coordinator.beginInterruption(isImeVisible = false)
        coordinator.finishInterruption()

        assertEquals(1, coordinator.focusRequestId)
    }

    @Test
    fun `overlay restores hardware focus without opening the software keyboard`() {
        val coordinator = ComposerFocusCoordinator()
        coordinator.onInputFocusChanged(true)

        coordinator.beginInterruption(isImeVisible = false)
        coordinator.onInputFocusChanged(false)
        coordinator.finishInterruption()

        assertEquals(1, coordinator.focusRequestId)
        assertFalse(coordinator.focusRequestShouldShowKeyboard)
    }

    @Test
    fun `overlay opened from an inactive composer stays inactive`() {
        val coordinator = ComposerFocusCoordinator()

        coordinator.beginInterruption(isImeVisible = false)
        coordinator.finishInterruption()

        assertEquals(0, coordinator.focusRequestId)
    }

    @Test
    fun `manual keyboard dismissal clears active composer focus`() {
        val coordinator = ComposerFocusCoordinator()
        coordinator.onInputFocusChanged(true)

        assertFalse(coordinator.onImeVisibilityChanged(isImeVisible = true))
        assertTrue(coordinator.onImeVisibilityChanged(isImeVisible = false))
    }

    @Test
    fun `overlay search transfers focus directly back to the composer`() {
        val coordinator = ComposerFocusCoordinator()
        coordinator.onInputFocusChanged(true)
        coordinator.onImeVisibilityChanged(isImeVisible = true)
        coordinator.beginInterruption(isImeVisible = true)
        coordinator.onInputFocusChanged(false)
        coordinator.onImeVisibilityChanged(isImeVisible = false)
        coordinator.onImeVisibilityChanged(isImeVisible = true)

        coordinator.finishInterruption()

        assertEquals(1, coordinator.focusRequestId)
        assertTrue(coordinator.focusRequestShouldShowKeyboard)
    }

    @Test
    fun `abandoning focus prevents later overlay restoration`() {
        val coordinator = ComposerFocusCoordinator()
        coordinator.onInputFocusChanged(true)
        coordinator.beginInterruption(isImeVisible = true)

        coordinator.abandonFocusRestoration()
        coordinator.finishInterruption()

        assertEquals(0, coordinator.focusRequestId)
    }
}
