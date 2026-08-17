package com.dust.mobile.android.auth

import android.content.Context
import android.util.Base64
import com.dust.mobile.core.auth.TokenStore
import com.dust.mobile.core.model.AuthResponse
import com.dust.mobile.core.model.AuthTokens

class AndroidTokenStore(context: Context) : TokenStore {
    private val prefs = context.getSharedPreferences("dust_auth", Context.MODE_PRIVATE)
    private val cipher = AndroidKeystoreCipher(KEY_ALIAS)

    override fun loadTokens(): AuthTokens? {
        val accessToken = prefs.getString(KEY_ACCESS_TOKEN, null)?.let(::decrypt) ?: return null
        val refreshToken = prefs.getString(KEY_REFRESH_TOKEN, null)?.let(::decrypt) ?: return null
        return AuthTokens(accessToken = accessToken, refreshToken = refreshToken)
    }

    override fun saveTokens(response: AuthResponse) {
        prefs.edit()
            .putString(KEY_ACCESS_TOKEN, encrypt(response.accessToken))
            .putString(KEY_REFRESH_TOKEN, encrypt(response.refreshToken))
            .remove(KEY_PENDING_CODE_VERIFIER)
            .apply()
    }

    override fun clearTokens() {
        prefs.edit().clear().apply()
    }

    fun loadPendingCodeVerifier(): String? =
        prefs.getString(KEY_PENDING_CODE_VERIFIER, null)?.let(::decrypt)

    fun savePendingCodeVerifier(codeVerifier: String) {
        prefs.edit()
            .putString(KEY_PENDING_CODE_VERIFIER, encrypt(codeVerifier))
            .apply()
    }

    fun clearPendingCodeVerifier() {
        prefs.edit()
            .remove(KEY_PENDING_CODE_VERIFIER)
            .apply()
    }

    private fun encrypt(plainText: String): String {
        return cipher.encrypt(plainText.encodeToByteArray()).base64()
    }

    private fun decrypt(encoded: String): String? {
        return runCatching {
            val legacyParts = encoded.split(":", limit = 2)
            if (legacyParts.size == 2) {
                cipher.decryptLegacy(
                    iv = legacyParts[0].fromBase64(),
                    encrypted = legacyParts[1].fromBase64(),
                )
            } else {
                cipher.decrypt(encoded.fromBase64())
            }.decodeToString()
        }.getOrNull()
    }

    private companion object {
        const val KEY_ALIAS = "dust_mobile_tokens"
        const val KEY_ACCESS_TOKEN = "access_token"
        const val KEY_REFRESH_TOKEN = "refresh_token"
        const val KEY_PENDING_CODE_VERIFIER = "pending_code_verifier"
    }
}

private fun ByteArray.base64(): String = Base64.encodeToString(this, Base64.NO_WRAP)

private fun String.fromBase64(): ByteArray = Base64.decode(this, Base64.NO_WRAP)
