package com.dust.mobile.core

import com.dust.mobile.core.config.DeepLinkRouter
import com.dust.mobile.core.config.DeepLinkTarget
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DeepLinkRouterTest {
    @Test
    fun `resolves auth callback with code`() {
        val target = DeepLinkRouter.resolve(
            rawUrl = "dust://auth?code=abc",
            appUrl = "https://app.dust.tt",
        )

        assertEquals(DeepLinkTarget.Auth("dust://auth?code=abc"), target)
    }

    @Test
    fun `resolves auth callback with configured host`() {
        val target = DeepLinkRouter.resolve(
            rawUrl = "dust-dev://callback?code=abc",
            appUrl = "https://app.dust.tt",
            callbackScheme = "dust-dev",
            callbackHost = "callback",
        )

        assertEquals(DeepLinkTarget.Auth("dust-dev://callback?code=abc"), target)
    }

    @Test
    fun `rejects auth callback with unexpected host`() {
        val target = DeepLinkRouter.resolve(
            rawUrl = "dust-dev://auth?code=abc",
            appUrl = "https://app.dust.tt",
            callbackScheme = "dust-dev",
            callbackHost = "callback",
        )

        assertNull(target)
    }

    @Test
    fun `resolves custom frame callback`() {
        val target = DeepLinkRouter.resolve(
            rawUrl = "dust://frame/frame_token",
            appUrl = "https://app.dust.tt",
        )

        assertEquals(DeepLinkTarget.Frame("https://app.dust.tt/share/frame/frame_token"), target)
    }

    @Test
    fun `resolves local preview callback`() {
        val target = DeepLinkRouter.resolve(
            rawUrl = "dust://local-preview",
            appUrl = "https://app.dust.tt",
            allowLocalPreview = true,
        )

        assertEquals(DeepLinkTarget.LocalPreview, target)
    }

    @Test
    fun `resolves local preview callback with configured scheme`() {
        val target = DeepLinkRouter.resolve(
            rawUrl = "dust-dev://local-preview",
            appUrl = "https://app.dust.tt",
            callbackScheme = "dust-dev",
            allowLocalPreview = true,
        )

        assertEquals(DeepLinkTarget.LocalPreview, target)
    }

    @Test
    fun `rejects local preview callback when local preview is disabled`() {
        val target = DeepLinkRouter.resolve(
            rawUrl = "dust://local-preview",
            appUrl = "https://app.dust.tt",
            allowLocalPreview = false,
        )

        assertNull(target)
    }

    @Test
    fun `custom frame callback uses the first path segment as token`() {
        val target = DeepLinkRouter.resolve(
            rawUrl = "dust://frame/frame_token/ignored",
            appUrl = "https://app.dust.tt",
        )

        assertEquals(DeepLinkTarget.Frame("https://app.dust.tt/share/frame/frame_token"), target)
    }

    @Test
    fun `resolves dust https frame share link`() {
        val target = DeepLinkRouter.resolve(
            rawUrl = "https://example.dust.tt/share/frame/frame_token",
            appUrl = "https://app.dust.tt",
        )

        assertEquals(DeepLinkTarget.Frame("https://app.dust.tt/share/frame/frame_token"), target)
    }

    @Test
    fun `resolves dust frame share link with uppercase host`() {
        val target = DeepLinkRouter.resolve(
            rawUrl = "https://APP.DUST.TT/share/frame/frame_token",
            appUrl = "https://app.dust.tt",
        )

        assertEquals(DeepLinkTarget.Frame("https://app.dust.tt/share/frame/frame_token"), target)
    }

    @Test
    fun `rejects non dust frame links`() {
        val target = DeepLinkRouter.resolve(
            rawUrl = "https://example.com/share/frame/frame_token",
            appUrl = "https://app.dust.tt",
        )

        assertNull(target)
    }

    @Test
    fun `embedded web view keeps dust and current app links in place`() {
        assertTrue(DeepLinkRouter.shouldOpenInEmbeddedWebView("https://app.dust.tt/share/frame/token"))
        assertTrue(
            DeepLinkRouter.shouldOpenInEmbeddedWebView(
                rawUrl = "http://10.0.2.2:3000/share/frame/token",
                allowedHost = "10.0.2.2",
            ),
        )
    }

    @Test
    fun `embedded web view sends external hosts to the system browser`() {
        assertFalse(
            DeepLinkRouter.shouldOpenInEmbeddedWebView(
                rawUrl = "https://example.com/docs",
                allowedHost = "10.0.2.2",
            ),
        )
        assertFalse(DeepLinkRouter.shouldOpenInEmbeddedWebView("https://dust.tt.example.com/docs"))
    }
}
