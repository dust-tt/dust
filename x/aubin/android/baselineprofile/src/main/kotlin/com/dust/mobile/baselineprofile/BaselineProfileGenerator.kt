package com.dust.mobile.baselineprofile

import androidx.benchmark.macro.junit4.BaselineProfileRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.LargeTest
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
@LargeTest
class BaselineProfileGenerator {
    @get:Rule
    val rule = BaselineProfileRule()

    @Before
    fun resetApp() {
        clearDustAppData()
    }

    @Test
    fun startup() = rule.collect(
        packageName = DustPackageName,
        includeInStartupProfile = true,
    ) {
        pressHome()
        startLocalPreview()
    }

    @Test
    fun inboxAndConversation() = rule.collect(
        packageName = DustPackageName,
        includeInStartupProfile = false,
    ) {
        pressHome()
        startLocalPreview()
        scrollInbox()
        openConversation()
        returnToInbox()
    }
}
