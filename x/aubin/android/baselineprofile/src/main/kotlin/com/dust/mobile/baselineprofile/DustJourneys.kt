package com.dust.mobile.baselineprofile

import android.content.Intent
import android.net.Uri
import androidx.benchmark.macro.MacrobenchmarkScope
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.Direction
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until

internal const val DustPackageName = "com.dust.mobile"

internal fun clearDustAppData() {
    val device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
    check(device.executeShellCommand("pm clear $DustPackageName").contains("Success")) {
        "Failed to clear Dust app data before the benchmark."
    }
}

internal fun MacrobenchmarkScope.startLocalPreview() {
    startActivityAndWait(
        Intent(Intent.ACTION_VIEW, Uri.parse("dust://local-preview")).apply {
            setClassName(DustPackageName, "$DustPackageName.android.MainActivity")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        },
    )
    check(device.wait(Until.hasObject(By.text("Revenue Team")), JourneyTimeoutMs)) {
        "The local preview inbox did not become ready."
    }
}

internal fun MacrobenchmarkScope.scrollInbox() {
    val inbox = device.wait(Until.findObject(By.scrollable(true)), JourneyTimeoutMs) ?: return
    inbox.setGestureMargin(device.displayWidth / 8)
    inbox.fling(Direction.DOWN)
    device.waitForIdle()
    inbox.fling(Direction.UP)
    device.waitForIdle()
}

internal fun MacrobenchmarkScope.openConversation() {
    val conversation = device.wait(
        Until.findObject(By.text("Prepare the Q3 customer briefing")),
        JourneyTimeoutMs,
    ) ?: error("The benchmark conversation was not visible.")
    conversation.click()
    check(
        device.wait(
            Until.hasObject(By.text("Ask anything or call an agent with @")),
            JourneyTimeoutMs,
        ),
    ) {
        "The conversation composer did not become ready."
    }
}

internal fun MacrobenchmarkScope.returnToInbox() {
    device.pressBack()
    check(device.wait(Until.hasObject(By.text("Revenue Team")), JourneyTimeoutMs)) {
        "The benchmark did not return to the inbox."
    }
}

private const val JourneyTimeoutMs = 10_000L
