package com.dust.mobile.android.data.offline

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.core.DataStoreFactory
import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import androidx.datastore.dataStoreFile
import java.io.IOException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.first

internal class OfflineCacheStore(context: Context) {
    private val dataStore: DataStore<OfflineCacheState> = DataStoreFactory.create(
        serializer = EncryptedOfflineCacheSerializer(),
        corruptionHandler = ReplaceFileCorruptionHandler { OfflineCacheState() },
        scope = CoroutineScope(SupervisorJob() + Dispatchers.IO),
        produceFile = { context.dataStoreFile(FILE_NAME) },
    )

    private val state: Flow<OfflineCacheState> = dataStore.data.catch { error ->
        if (error is IOException) emit(OfflineCacheState()) else throw error
    }

    suspend fun current(): OfflineCacheState = state.first()

    suspend fun update(transform: (OfflineCacheState) -> OfflineCacheState): OfflineCacheState =
        dataStore.updateData(transform)

    suspend fun clear() {
        dataStore.updateData { OfflineCacheState() }
    }

    private companion object {
        const val FILE_NAME = "dust_offline_cache.pb"
    }
}
