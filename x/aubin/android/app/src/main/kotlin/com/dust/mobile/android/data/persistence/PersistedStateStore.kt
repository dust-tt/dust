package com.dust.mobile.android.data.persistence

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
import kotlinx.coroutines.flow.flowOf

internal class PersistedStateStore(context: Context) {
    private val dataStore: DataStore<PersistedAppState> = DataStoreFactory.create(
        serializer = EncryptedStateSerializer(),
        corruptionHandler = ReplaceFileCorruptionHandler { PersistedAppState() },
        scope = CoroutineScope(SupervisorJob() + Dispatchers.IO),
        produceFile = { context.dataStoreFile(FILE_NAME) },
    )

    val state: Flow<PersistedAppState> = dataStore.data.catch { error ->
        if (error is IOException) {
            emit(PersistedAppState())
        } else {
            throw error
        }
    }

    suspend fun current(): PersistedAppState = state.first()

    suspend fun update(transform: (PersistedAppState) -> PersistedAppState): PersistedAppState =
        dataStore.updateData(transform)

    suspend fun clear() {
        dataStore.updateData { PersistedAppState() }
    }

    private companion object {
        const val FILE_NAME = "dust_app_state.pb"
    }
}
