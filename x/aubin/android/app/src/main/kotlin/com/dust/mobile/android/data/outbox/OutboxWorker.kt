package com.dust.mobile.android.data.outbox

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.dust.mobile.android.DustApplication

internal class OutboxWorker(
    appContext: Context,
    workerParameters: WorkerParameters,
) : CoroutineWorker(appContext, workerParameters) {
    override suspend fun doWork(): Result {
        val graph = (applicationContext as DustApplication).graph
        val tokens = graph.tokenStore.loadTokens() ?: return Result.success()
        val tokenProvider = graph.tokenProvider(tokens) { graph.clearPersistedSession() }
        graph.outboxRepository.flush(tokenProvider)
        return Result.success()
    }
}
