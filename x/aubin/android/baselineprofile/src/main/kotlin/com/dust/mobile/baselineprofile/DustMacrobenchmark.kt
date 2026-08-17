package com.dust.mobile.baselineprofile

import androidx.benchmark.macro.BaselineProfileMode
import androidx.benchmark.macro.CompilationMode
import androidx.benchmark.macro.FrameTimingMetric
import androidx.benchmark.macro.StartupMode
import androidx.benchmark.macro.StartupTimingMetric
import androidx.benchmark.macro.junit4.MacrobenchmarkRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.LargeTest
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
@LargeTest
class DustMacrobenchmark {
    @get:Rule
    val rule = MacrobenchmarkRule()

    @Before
    fun resetApp() {
        clearDustAppData()
    }

    @Test
    fun startupWithoutCompilation() = measureStartup(CompilationMode.None())

    @Test
    fun startupWithBaselineProfile() = measureStartup(
        CompilationMode.Partial(BaselineProfileMode.Require),
    )

    @Test
    fun inboxAndConversationFrames() = rule.measureRepeated(
        packageName = DustPackageName,
        metrics = listOf(FrameTimingMetric()),
        compilationMode = CompilationMode.Partial(BaselineProfileMode.Require),
        startupMode = null,
        iterations = 5,
        setupBlock = {
            pressHome()
            startLocalPreview()
        },
        measureBlock = {
            scrollInbox()
            openConversation()
            returnToInbox()
        },
    )

    private fun measureStartup(compilationMode: CompilationMode) = rule.measureRepeated(
        packageName = DustPackageName,
        metrics = listOf(StartupTimingMetric()),
        compilationMode = compilationMode,
        startupMode = StartupMode.COLD,
        iterations = 10,
        setupBlock = {
            pressHome()
        },
        measureBlock = {
            startLocalPreview()
        },
    )
}
