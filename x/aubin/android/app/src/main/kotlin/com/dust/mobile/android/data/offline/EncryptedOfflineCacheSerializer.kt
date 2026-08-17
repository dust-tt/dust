package com.dust.mobile.android.data.offline

import androidx.datastore.core.CorruptionException
import androidx.datastore.core.Serializer
import com.dust.mobile.android.auth.AndroidKeystoreCipher
import com.dust.mobile.core.network.DustJson
import java.io.InputStream
import java.io.OutputStream
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString

internal class EncryptedOfflineCacheSerializer : Serializer<OfflineCacheState> {
    private val cipher = AndroidKeystoreCipher(KEY_ALIAS)

    override val defaultValue: OfflineCacheState = OfflineCacheState()

    override suspend fun readFrom(input: InputStream): OfflineCacheState {
        val encrypted = input.readBytes()
        if (encrypted.isEmpty()) return defaultValue
        return try {
            DustJson.decodeFromString(cipher.decrypt(encrypted).decodeToString())
        } catch (error: Exception) {
            throw CorruptionException("Unable to read encrypted offline cache", error)
        }
    }

    override suspend fun writeTo(t: OfflineCacheState, output: OutputStream) {
        output.write(cipher.encrypt(DustJson.encodeToString(t).encodeToByteArray()))
    }

    private companion object {
        const val KEY_ALIAS = "dust_mobile_offline_cache"
    }
}
