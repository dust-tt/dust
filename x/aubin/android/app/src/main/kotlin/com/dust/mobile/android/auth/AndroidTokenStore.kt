package com.dust.mobile.android.auth

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.dust.mobile.core.auth.TokenStore
import com.dust.mobile.core.model.AuthResponse
import com.dust.mobile.core.model.AuthTokens
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class AndroidTokenStore(context: Context) : TokenStore {
    private val prefs = context.getSharedPreferences("dust_auth", Context.MODE_PRIVATE)

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
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        val iv = cipher.iv
        val encrypted = cipher.doFinal(plainText.encodeToByteArray())
        return "${iv.base64()}:${encrypted.base64()}"
    }

    private fun decrypt(encoded: String): String? {
        val parts = encoded.split(":", limit = 2)
        if (parts.size != 2) return null
        return runCatching {
            val iv = parts[0].fromBase64()
            val encrypted = parts[1].fromBase64()
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), GCMParameterSpec(GCM_TAG_BITS, iv))
            cipher.doFinal(encrypted).decodeToString()
        }.getOrNull()
    }

    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        (keyStore.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry)?.secretKey?.let { return it }

        val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        val spec = KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true)
            .build()
        keyGenerator.init(spec)
        return keyGenerator.generateKey()
    }

    private companion object {
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val KEY_ALIAS = "dust_mobile_tokens"
        const val KEY_ACCESS_TOKEN = "access_token"
        const val KEY_REFRESH_TOKEN = "refresh_token"
        const val KEY_PENDING_CODE_VERIFIER = "pending_code_verifier"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val GCM_TAG_BITS = 128
    }
}

private fun ByteArray.base64(): String = Base64.encodeToString(this, Base64.NO_WRAP)

private fun String.fromBase64(): ByteArray = Base64.decode(this, Base64.NO_WRAP)
