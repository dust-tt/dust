package com.dust.mobile.android.data.persistence

import androidx.datastore.core.CorruptionException
import androidx.datastore.core.Serializer
import com.dust.mobile.android.auth.AndroidKeystoreCipher
import com.dust.mobile.core.network.DustJson
import java.io.InputStream
import java.io.OutputStream
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString

internal class EncryptedStateSerializer : Serializer<PersistedAppState> {
    private val cipher = AndroidKeystoreCipher(KEY_ALIAS)

    override val defaultValue: PersistedAppState = PersistedAppState()

    override suspend fun readFrom(input: InputStream): PersistedAppState {
        val encrypted = input.readBytes()
        if (encrypted.isEmpty()) {
            return defaultValue
        }
        return try {
            val json = cipher.decrypt(encrypted).decodeToString()
            DustJson.decodeFromString(json)
        } catch (error: Exception) {
            throw CorruptionException("Unable to read encrypted app state", error)
        }
    }

    override suspend fun writeTo(t: PersistedAppState, output: OutputStream) {
        val encoded = DustJson.encodeToString(t).encodeToByteArray()
        output.write(cipher.encrypt(encoded))
    }

    private companion object {
        const val KEY_ALIAS = "dust_mobile_app_state"
    }
}
